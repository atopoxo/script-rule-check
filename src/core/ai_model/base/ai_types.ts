import type { ToolCall } from '../../tools/tools_mgr';

export class ModelInfo {
    constructor(
        public url: string,
        public id: string,
        public platform: string,
        public codeName: string,
        public modelName: string,
        public temperature: number,
        public maxTokens: number,
        public name: string,
        public type: string,
        public apiKey: string
    ) {}
}

export interface Message {
    role: string;
    content: string;
}

export interface ContentMap {
    think_content: string;
    conclusion_content: string;
}

export interface ToolTip {
    tools_usage: string;
    tools_describe: string;
}

export interface Delta {
    reasoning?: string;
    conclusion?: string;
}

export interface Cache {
    tools_describe: ToolTip;
    tool_calls: ToolCall[][];
    knowledge: string;
    backup: string;
    returns: {
        [key: string]: any;
        ai: {
            ai_conclusion?: string;
        };
    };
}

export interface InputData {
    userID?: string;
    message: Message[];
    toolsOn?: boolean;
    useKnowledge?: boolean;
    modelConfig?: any;
    cache: Cache;
}