import * as path from 'path';
// import * as copy from 'lodash/cloneDeep';
const copy = require('lodash/cloneDeep');
import { getJsonParser } from '../../json/json_parser';
import { ContextMgr } from '../../context/context_mgr';
import { ToolsMgr } from '../../tools/tools_mgr';
import type { ToolCall } from '../../tools/tools_mgr';
import type { ContentMap, Delta, InputData, Session, Message } from './ai_types';

export abstract class AIModelBase {
    protected jsonParser = getJsonParser();
    protected config: any;
    protected mode: string = "online";
    protected name: string = "";
    protected storage: any;
    protected assistant: string = "assistant";
    protected sentence_divisions: string[] = ["。", "！", "!", "？", "?", "\n"];
    protected toolsMgr: ToolsMgr;
    protected contextMgr?: ContextMgr;
    protected knowledgeMgr?: any;
    protected additional_tips = {
        begin: "<|tips_start|>",
        end: "<|tips_end|>"
    };

    constructor(config: any, helper: any) {
        this.config = config;
        this.storage = helper.storage;
        this.contextMgr = helper.contextMgr;
        this.knowledgeMgr = helper.knowledgeMgr;
        this.toolsMgr = new ToolsMgr(config);
    }

    abstract chatStream(signal: AbortSignal, inputData: any): AsyncGenerator<any, void, unknown>;

    async getResponse(moduleName: string, messages: any[], stream: boolean = true, maxTokens: number = 8192, index: number = -1): Promise<any> {
        throw new Error("Method not implemented.");
    }

    getDelta(chunk: any): Delta {
        throw new Error("Method not implemented.");
    }

    async *streamGeneratorFramework(signal: AbortSignal, inputData: InputData): AsyncGenerator<string, void, unknown> {
        const needSave = true;
        const toolsOn = inputData.toolsOn || false;
        const userId = inputData.userID;
        const instanceName = inputData.instanceName;
        const session = inputData.session as Session;
        const sessionId = session.sessionId;
        const messages = inputData.history;
        const index = inputData.index ? inputData.index : messages.length - 1;
        const useKnowledge = inputData.useKnowledge || false;
        const modelConfig = inputData.modelConfig;
        const modelName = modelConfig.modelName;
        const maxTokens = modelConfig.maxTokens || 8192;
        const cache = inputData.cache;
        let messageReplace = false;
        let hasTask = true;
        let streamContent = "";
        let currentIndex = index;

        while (hasTask) {
            try {
                this.handleReferences(messages, cache, currentIndex);
                this.handleKnowledge(useKnowledge, messages, cache, currentIndex);
                if (toolsOn) {
                    currentIndex = this.checkToolTips(messages, cache, true, currentIndex);
                    const contentMap: ContentMap = { think_content: "", conclusion_content: "" };
                    for await (const _ of this.streamGenerator(signal, userId, session, modelName!, messages, maxTokens, contentMap, currentIndex, messageReplace)) {}
                    currentIndex = this.checkToolTips(messages, cache, false, currentIndex);
                    const tools = this.toolsMgr.getTools(contentMap.conclusion_content);
                    yield* this.reportToolInfos(tools, contentMap.conclusion_content);
                    const returnToAi = await this.handleToolCalls(tools, messages, cache, currentIndex);
                    if (!returnToAi) {
                        streamContent = `最终结论如下：${cache.returns.ai.ai_conclusion}`;
                        yield streamContent;
                        break;
                    }
                }
                const contentMap: ContentMap = { think_content: "", conclusion_content: "" };
                yield* this.streamGenerator(signal, userId, session, modelName!, messages, maxTokens, contentMap, currentIndex, messageReplace);
                streamContent = contentMap.think_content + contentMap.conclusion_content;
                cache.returns.ai.ai_conclusion = contentMap.conclusion_content;
                hasTask = cache.tool_calls.length > 0;
            } catch (ex) {
                streamContent = "无法响应您的请求，请稍后再试...";
                yield streamContent;
                console.error(ex as Error);
            } finally {
                await this.saveMessages(needSave, streamContent, messages, userId, instanceName, sessionId, messageReplace, currentIndex);
                messageReplace = true;
            }
        }
        cache.tools_describe = { tools_usage: "", tools_describe: "" };
        cache.context = "";
        cache.knowledge = "";
        await this.saveCache(needSave, cache, userId, instanceName, sessionId);
    }

    private checkToolTips(messages: Message[], cache: any, begin: boolean, index: number): number {
        let returnIndex = index;
        if (begin) {
            const preToolTips = cache.tools_describe;
            const toolTips = this.toolsMgr.getAIUsageTips(preToolTips, cache.tool_calls);
            toolTips.tools_usage = `${this.additional_tips.begin}${toolTips.tools_usage}${this.additional_tips.end}`;
            
            if (!preToolTips) {
                cache.tools_describe = toolTips.tools_describe;
                messages[0].content += toolTips.tools_describe;
                cache.backup = copy(messages[index].content);
                messages[index].content += toolTips.tools_usage;
            } else {
                const message = { role: "user", content: toolTips.tools_usage, timestamp: Date.now() };
                returnIndex = index + 2;
                if (returnIndex < messages.length) {
                    messages.splice(returnIndex, 0, message);
                } else {
                    messages.push(message);
                }
            }
        } else {
            if (cache.backup) {
                messages[index].content = cache.backup;
                cache.backup = undefined;
            } else {
                if (messages[returnIndex].role === "user") {
                    messages.pop();
                    returnIndex -= 2;
                }
            }
        }
        return returnIndex;
    }

    private *reportToolInfos(tools: any[][], content: string): Generator<string, void, unknown> {
        if (tools.length > 0) {
            yield `经过分析需要调用如下工具：${content}`;
        } else {
            yield "经过分析暂不需要调用工具";
        }
    }

    private async *streamGenerator(signal: AbortSignal, userId: string | undefined, session:Session, moduleName: string, messages: Message[], maxTokens: number, contentMap: ContentMap, index: number, messageReplace: boolean): AsyncGenerator<string, void, unknown> {
        const response = await this.getResponse(moduleName, messages, true, maxTokens, index);
        for await (const chunk of response) {
            if (signal.aborted) {
                return;
            }
            const delta = this.getDelta(chunk);
            yield* this.handleStreamNormalCalls(delta, contentMap);
            if (session.forceSave) {
                const streamContent = contentMap.think_content + contentMap.conclusion_content;
                await this.saveSessionMessages(true, streamContent, messages, userId, session, messageReplace, index);
                session.forceSave = false;
                session.refresh = true;
            }
        }
        yield* this.handleStreamNormalCalls(undefined, contentMap);
    }

    private handleToolCalls(tools: ToolCall[][], messages: Message[], cache: any, index: number): string | null {
        let currentTools: ToolCall[] = [];
        const toolSet = new Set<string>();
        
        if (tools.length === 0) {
            tools = cache.tool_calls;
        }
        let invalidFormat = false;
        for (const toolList of tools) {
            if (!Array.isArray(toolList)) {
                invalidFormat = true;
                break;
            }
        }
        if (invalidFormat) {
            tools = [tools as unknown as ToolCall[]];
        }
        if (tools.length > 0) {
            currentTools = tools[0];
            tools.splice(0, 1);
        }
        for (const toolList of tools) {
            for (const tool of toolList) {
                toolSet.add(tool.id);
            }
        }

        const toolsMessages = { return_to_ai: null as string | null };
        for (const call of currentTools) {
            const id = call.id;
            const toolConfig = this.toolsMgr.getTool(id);
            const nextToolId = toolConfig?.next_tool_id;
            
            if (nextToolId && !toolSet.has(nextToolId)) {
                if (tools.length === 0) {
                    tools.push([]);
                }
                const nextTool = this.toolsMgr.getTool(nextToolId);
                if (nextTool) {
                    tools[0].push(nextTool);
                    toolSet.add(nextToolId);
                }
            }

            const func = call.function!;
            const moduleName = func.module;
            const className = func.class;
            const functionName = func.name;
            const args = this.parseArguments(func.arguments);
            for (const key in args) {
                if (typeof args[key] === 'string' && args[key].startsWith('$')) {
                    const temp = args[key].substring(1);
                    const [id, varName] = temp.split(':');
                    args[key] = cache.returns[id][varName];
                }
            }

            try {
                const result = this.toolsMgr.callTool(moduleName, className, functionName, args);
                if (result) {
                    for (const [variable, item] of Object.entries(result)) {
                        const returnType = this.toolsMgr.getToolReturnType(moduleName, className, functionName, variable); 
                        if (returnType === "ai_tips") {
                            this.buildToolsMessages(toolsMessages, call.id, item as string);
                        } else if (returnType === "ai_conclusion") {
                            cache.returns.ai.ai_conclusion = item;
                        } else {
                            cache.returns[id] = item;
                        }
                    }
                }
            } catch (ex) {
                console.error(`调用工具失败: ${ex}`);
            }
        }

        this.buildToolsMessages(toolsMessages, null, null);
        if (toolsMessages.return_to_ai) {
            let flag = false;
            for (const end of this.sentence_divisions) {
                if (messages[index].content.endsWith(end)) {
                    flag = true;
                    break;
                }
            }
            if (!flag) {
                messages[index].content += "\n";
            }
            messages[index].content += `${this.additional_tips.begin}${toolsMessages.return_to_ai}${this.additional_tips.end}`;
        }

        cache.tool_calls = tools;
        return toolsMessages.return_to_ai;
    }

    private parseArguments(args: any): any {
        try {
            if (typeof args === 'string') {
                return this.jsonParser.parse(args);
            }
            return args;
        } catch (ex) {
            console.error(`参数解析失败: ${ex}`);
            return {};
        }
    }

    private buildToolsMessages(toolsMessages: any, id: string | null, result: string | null): void {
        if (result) {
            if (toolsMessages.return_to_ai === null) {
                toolsMessages.return_to_ai = `根据用户的问题，以下是各个工具的调用情况：\n{\n`;
            } else {
                toolsMessages.return_to_ai += ",\n";
            }
            toolsMessages.return_to_ai += `{'${id}':${result}}`;
        } else {
            if (toolsMessages.return_to_ai) {
                toolsMessages.return_to_ai += "\n}\n";
            }
        }
    }

    private handleReferences(messages: Message[], cache: any, index: number): void {
        if (!cache.context && this.contextMgr && messages[index].contextOption) {
            const contextDescribe = this.contextMgr.getContext(messages[index].contextOption);
            if (contextDescribe) {
                cache.context = `${this.additional_tips.begin}${contextDescribe}${this.additional_tips.end}`;
                messages[index].content += cache.context;
            }
        }
    }

    private handleKnowledge(useKnowledge: boolean, messages: Message[], cache: any, index: number): void {
        if (useKnowledge && !cache.knowledge && this.knowledgeMgr) {
            const searchContent = this.knowledgeMgr.search(messages[index].content);
            if (searchContent) {
                cache.knowledge = `${this.additional_tips.begin}${searchContent}${this.additional_tips.end}`;
                messages[index].content += cache.knowledge;
            }
        }
    }

    private *handleStreamNormalCalls(delta: Delta | undefined, contentMap: ContentMap): Generator<string, void, unknown> {
        let chunkDeltal = "";
        if (delta) {
            if (delta.reasoning != null) {
                let reasoningContent = delta.reasoning;
                if (contentMap.conclusion_content.startsWith("<conclusion>") && !contentMap.conclusion_content.endsWith("</conclusion>")) {
                    const deltaContent = "</conclusion>";
                    contentMap.conclusion_content += deltaContent;
                    yield* this.updateDeltaContent(deltaContent);
                }
                if (!contentMap.think_content.startsWith("<think>")) {
                    reasoningContent = "<think>" + reasoningContent;
                }
                contentMap.think_content += reasoningContent;
                chunkDeltal = reasoningContent;
            } else if (delta.conclusion != null) {
                let conclusionContent = delta.conclusion;
                if (contentMap.think_content.startsWith("<think>") && !contentMap.think_content.endsWith("</think>")) {
                    const deltaContent = "</think>";
                    contentMap.think_content += deltaContent;
                    yield* this.updateDeltaContent(deltaContent);
                }
                if (!contentMap.conclusion_content.startsWith("<conclusion>")) {
                    conclusionContent = "<conclusion>" + conclusionContent;
                }
                contentMap.conclusion_content += conclusionContent;
                chunkDeltal = conclusionContent;
            }
            yield* this.updateDeltaContent(chunkDeltal);
        } else {
            if (contentMap.think_content.startsWith("<think>") && !contentMap.think_content.endsWith("</think>")) {
                const deltaContent = "</think>";
                contentMap.think_content += deltaContent;
                yield* this.updateDeltaContent(deltaContent);
            }
            if (contentMap.conclusion_content.startsWith("<conclusion>") && !contentMap.conclusion_content.endsWith("</conclusion>")) {
                const deltaContent = "</conclusion>";
                contentMap.conclusion_content += deltaContent;
                yield* this.updateDeltaContent(deltaContent);
            }
        }
    }

    private* updateDeltaContent(deltaContent: string): Generator<string, void, unknown> {
        yield deltaContent;
    }

    private async saveMessages(needSave: boolean, response: string, history: Message[], userId: string | undefined, instanceName: string | undefined, sessionId: string | undefined, messageReplace: boolean, index: number) {
        if (needSave && userId && instanceName) {
            const aiMessageIndex = index + 1;
            const message: Message = { role: this.assistant, content: response, timestamp: Date.now() };
            if (messageReplace && aiMessageIndex < history.length) {
                history[aiMessageIndex] = message;
            } else {
                if (aiMessageIndex < history.length) {
                    history[aiMessageIndex] = message;
                } else {
                    history.push(message);
                }
            }
            await this.storage.updateUserInfo(userId, instanceName, sessionId, message, undefined, messageReplace=messageReplace, aiMessageIndex);
        }
    }

    private async saveCache(needSave: boolean, cache: any, userId: string | undefined, instanceName: string | undefined, sessionId: string | undefined) {
        if (needSave && userId && instanceName) {
            await this.storage.updateUserInfo(userId, instanceName, sessionId, undefined, cache);
        }
    }

    private async saveSessionMessages(needSave: boolean, response: string, history: Message[], userId: string | undefined, session: Session | undefined, messageReplace: boolean, index: number) {
        if (needSave && userId && session) {
            const aiMessageIndex = index + 1;
            const message: Message = { role: this.assistant, content: response, timestamp: Date.now() };
            if (messageReplace && aiMessageIndex < history.length) {
                history[aiMessageIndex] = message;
            } else {
                if (aiMessageIndex < history.length) {
                    history[aiMessageIndex] = message;
                } else {
                    history.push(message);
                }
            }
            await this.storage.updateUserInfoBySession(userId, session, message, undefined, messageReplace=messageReplace, aiMessageIndex);
        }
    }

    private getConfig(): any {
        let configPath = path.join(path.dirname(__dirname), this.mode);
        configPath = path.join(path.join(configPath, this.name), "config.json");
        const data = this.jsonParser.readJsonFile(configPath);
        return data
    }
}