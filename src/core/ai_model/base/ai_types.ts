import * as vscode from 'vscode';
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

export interface ReferenceItem {
    type: 'code' | 'file' | 'folder';
    path: string;
    name: string;
    content?: string;
    range?: vscode.Range;
}

export interface Message {
    role: string;
    content: string;
    timestamp: number;
    references?: ReferenceItem[];
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

export interface Session {
    sessionId: string;
    lastModifiedTimestamp: number;
    name: string;
    round: number;
    history: Message[];
    cache: Cache;
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
    toolsOn?: boolean;
    useKnowledge?: boolean;
    modelConfig?: any;
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