import * as path from 'path';
import { singleton } from 'tsyringe';
import { getJsonParser } from '../json/json_parser';

interface ToolConfig {
    id: string;
    type: string;
    [key: string]: any;
    next_tool_id?: string;
    returns?: {
        type: string;
        properties: Record<string, { return_type: string }>;
        required: string[];
    };
}

interface ToolFunctionCall {
    module: string;
    class: string;
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, {
            type: string;
            description: string;
            default?: any;
        }>;
        required: string[];
    };
}

export interface ToolCall {
    id: string;
    function: {
        module: string;
        class: string;
        name: string;
        arguments: Record<string, any>;
    };
}

interface ToolModuleCache {
    cache: Record<string, Function>;
    call: any;
}

interface ToolsMap {
    [module: string]: {
        [className: string]: ToolModuleCache;
    };
}

interface AIUsageTips {
    tools_describe: string | null;
    tools_usage: string | null;
}

@singleton()
export class ToolsMgr {
    private config: any;
    private toolsConfig: ToolConfig[];
    private tools: ToolsMap = {};
    private jsonParser = getJsonParser();

    constructor(config: any) {
        this.config = config;
        const configPath = path.join(__dirname, 'config.json');
        this.toolsConfig = this.loadToolsConfig(configPath);
        this.loadTools(this.toolsConfig);
    }

    public getAIUsageTips(toolTips: boolean, toolCalls: ToolCall[][]): AIUsageTips {
        const result: AIUsageTips = {
            tools_describe: null,
            tools_usage: null
        };

        const toolCallCheckStr = `请直接生成如下格式的结果：
            \`\`\`json
            {
                "tool_calls":[
                    [
                        {
                            "id": "该工具的标示符，请不要修改",
                            "function": {
                                "module": "browser",
                                "class": "Browser",
                                "name": "search",
                                "arguments": {
                                    "query": "需要搜索的关键词或问题，例如：'今日A股走势分析', '杭州天气'"
                                }
                        }
                    ],
                    [
                        {
                            "id": "该工具的标示符，请不要修改",
                            "function": {
                                "module": "browser",
                                "class": "Browser",
                                "name": "search",
                                "arguments": {
                                    "query": "需要搜索的关键词或问题，例如：'今日A股走势分析', '杭州天气'"
                                }
                        }
                    ]
                ]
            }
            \`\`\`
            其中arguments为该工具的参数，其值用map表示，其中key为变量名，value为该变量的取值，例如：{"query": "需要搜索的关键词或问题"}，"tool_calls"中的每一项是一个array，它表示每一轮需要调用的工具列表，每一轮工具列表中的所有工具调用后，都需要调用大模型。
            注意："tool_calls"必须是一个二维的list，例如：[[], [], []]，
            反之，请直接生成如下格式的结果：
            \`\`\`json
            {
                "tool_calls":[]
            }`;

        if (toolTips) {
            let toolsUsage = '';
            if (toolCalls.length > 0) {
                if (toolCalls[0].length > 0) {
                    const toolCallsStr = this.jsonParser.toJsonStr(toolCalls[0]);
                    toolsUsage = `\n## 上一轮的分析认为，当前还需要调用如下工具：${toolCallsStr}，`;
                }
                if (toolCalls.length > 1) {
                    const nextToolCalls = toolCalls.slice(1);
                    const nextToolCallsStr = this.jsonParser.toJsonStr(nextToolCalls);
                    toolsUsage += `之后的几轮分析还需要调用工具：${nextToolCallsStr}`;
                }
                toolsUsage += `\n请判断是否需要更新当前或之后几轮的调用工具集，如果需要，${toolCallCheckStr}\n`;
            } else {
                toolsUsage = `\n## 请判断是否需要调用工具，如果需要，${toolCallCheckStr}，`;
            }
            result.tools_usage = toolsUsage;
        } else {
            const tools = this.getToolsConfig();
            const toolsStr = this.jsonParser.toJsonStr(tools);
            result.tools_describe = `\n## 在生成时请注意，你有如下工具可以调用：
                ${toolsStr}
                参数解释：
                    1."properties"表示传入参数，其值用一个map表示，key为变量名，value为该变量的描述。
                    2.每个变量的描述用一个map表示，"type"表示该变量对应的python类型，"description"表示该变量的描述，"default"表示该变量的默认值，如果该变量没有默认值，则不填该字段。
                    3."required"为必须要有的传入参数列表，其值用一个列表表示，列表中的每一项为变量名，例如：["query"]。
                    4."name"表示该函数名称，例如："search"。
                    5."class"表示该函数的类，例如："Browser"。
                    6."module"表示该函数的类，例如："browser"。
                    7."type"表示该工具的类型，例如："function"，如果type为"function"，则表示该工具是一个函数，可以调用，并且"function"描述了如何调用该函数。\n`;
            result.tools_usage = `\n## 当你发现回答用户的问题需要调用工具时，${toolCallCheckStr}\n`;
        }
        return result;
    }

    public getTools(content: string): ToolCall[][] {
        return this.parseTools(content);
    }

    public getTool(toolId: string): any {
        const toolConfig = this.toolsConfig.find(tool => tool.id === toolId);
        if (!toolConfig) {
            return null;
        }

        const type = toolConfig.type;
        const call = toolConfig[type] as ToolFunctionCall;
        const argMap: Record<string, any> = {};

        Object.entries(call.parameters.properties).forEach(([argName, argInfo]) => {
            argMap[argName] = 'default' in argInfo ? argInfo.default : null;
        });

        return {
            id: toolConfig.id,
            next_tool_id: toolConfig.next_tool_id,
            [type]: {
                module: call.module,
                class: call.class,
                name: call.name,
                arguments: argMap
            }
        };
    }

    public callTool(moduleName: string, className: string, functionName: string, args: Record<string, any>): any {
        moduleName = moduleName || '';
        if (!this.tools[moduleName]) {
            return null;
        }

        const moduleMap = this.tools[moduleName];
        className = className || '';

        if (!moduleMap[className]) {
            return null;
        }
        const classMap = moduleMap[className];
        const classCall = classMap.call;

        functionName = functionName || '';
        if (!classMap.cache[functionName]) {
            return null;
        }
        const functionCall = classMap.cache[functionName];

        return classCall ? classCall[functionName](args) : functionCall(args);
    }

    public getToolsConfig(): any {
        return this.toolsConfig;
    }

    public getToolReturnType(moduleName: string, className: string, functionName: string, variable: string): string | null {
        const tool = this.toolsConfig.find(tool => {
            const type = tool.type;
            const call = tool[type] as ToolFunctionCall;
            return call.module === moduleName && 
                   call.class === className && 
                   call.name === functionName;
        });

        if (!tool || !tool.returns) {
            return null;
        }
        
        const returnProp = tool.returns.properties[variable];
        return returnProp ? returnProp.return_type : null;
    }

    private loadToolsConfig(filePath: string): any {
        const jsonData = this.jsonParser.readJsonFile(filePath);
        return jsonData.tools;
    }

    private loadTools(toolsConfig: ToolConfig[]): void {
        toolsConfig.forEach(item => {
            let className = undefined;
            let functionName = undefined;
            try {
                const type = item.type;
                const call = item[type] as ToolFunctionCall;
                const moduleName = call.module || 'base';

                const modulePath = path.join(__dirname, `${moduleName}/${moduleName}`);
                const toolModule = require(modulePath);
                
                if (!this.tools[moduleName]) {
                    this.tools[moduleName] = {};
                }
                const moduleCache = this.tools[moduleName];
                
                className = call.class || '';
                if (!moduleCache[className]) {
                    const classInstance = new toolModule[className](this.config);
                    moduleCache[className] = {
                        cache: {},
                        call: classInstance
                    };
                }
                
                const classCache = moduleCache[className].cache;
                functionName = call.name || '';
                
                if (!classCache[functionName]) {
                    classCache[functionName] = moduleCache[className].call[functionName].bind(moduleCache[className].call);
                }
            } catch (error) {
                console.error(`Failed to load tool ${className}:${functionName} due to error: ${error}`);
            }
        });
    }

    private parseTools(content: string): ToolCall[][] {
        try {
            const toolJson = this.jsonParser.parse(content);
            if (toolJson.tool_calls) {
                return toolJson.tool_calls;
            }
            return [];
        } catch (error) {
            console.error("Tools parse failed");
            return [];
        }
    }
}