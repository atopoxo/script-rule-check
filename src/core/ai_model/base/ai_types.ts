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
        public showConfig: boolean,
        public safe: boolean,
        public apiKey: string
    ) {}
}

export class AICharacterInfo {
    constructor(
        public id: string,
        public name: string,
        public describe: string
    ) {}
}

export class SearchEngineInfo {
    constructor(
        public id: string,
        public name: string,
        public engineId: string,
        public url: string,
        public apiKey: string,
        public showConfig: boolean
    ) {}
}

export interface ContextItem {
    type: string;
    name: string;
    paths?: string[],
    content?: string;
    range?: {
        start: number, 
        end: number,
        startLine?: number, 
        endLine?: number
    };
}

export interface ContextOption {
    type: string,
    id: string,
    name: string,
    describe: string,
    icon?: string,
    contextItem?: ContextItem,
    children?: ContextOption[]
}

export interface Message {
    role: string;
    content: string;
    timestamp: number;
    contextOption?: ContextOption[];
    contextExpand?: boolean;
}

export interface Cache {
    tools_usage: string;
    tools_describe: string;
    tool_calls: ToolCall[][];
    context: string;
    knowledge: string;
    backup: string;
    returns: {
        [key: string]: any;
        ai: {
            ai_conclusion?: string;
        };
    };
}

export interface Session {
    sessionId: string;
    lastModifiedTimestamp: number;
    name: string;
    round: number;
    history: Message[];
    cache: Cache;
    isAIStreamTransfer: boolean;
    forceSave: boolean;
    refresh: boolean;
}

export interface AIInstance {
    sessions: Record<string, Session>;
    selectedSessionId: string;
    modelId?: string;
}

export interface UserInfo {
    aiConfig: Record<string, any>;
    aiInstance: Record<string, AIInstance>;
}

export interface InputData {
    history: Message[];
    cache: Cache;
    index?: number;
    userID?: string;
    instanceName?: string;
    session?: Session;
    toolsOn?: boolean;
    useKnowledge?: boolean;
    modelConfig?: any;
}

export interface ContentMap {
    think_content: string;
    conclusion_content: string;
}

export interface Delta {
    reasoning?: string;
    conclusion?: string;
}

export interface ContextTreeNode {
    value: ContextItem | undefined;
    children: ContextTreeNode[];
}