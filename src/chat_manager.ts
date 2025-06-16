import * as vscode from 'vscode';
import { Message, InputData } from './core/ai_model/base/ai_types';
import { Storage } from './core/storage/storage';
import { AIModelMgr } from './core/ai_model/manager/ai_model_mgr';

export interface ReferenceItem {
    type: 'code' | 'file' | 'folder';
    path: string;
    name: string;
    content?: string;
    range?: vscode.Range;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    references?: ReferenceItem[];
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    lastActive: number;
}

export class ChatManager {
    private static instance: ChatManager;
    private context: vscode.ExtensionContext;
    private currentSession: ChatSession | null = null;
    private aiModelMgr: AIModelMgr;
    private userID: string = "";
    private storage: Storage;
    private defaultModelID: string = "";
    public ready: Promise<void>;

    private constructor(context: vscode.ExtensionContext, userID: string, storage: Storage, defaultModelID: string, aiModelMgr: AIModelMgr) {
        this.context = context;
        this.userID = userID;
        this.defaultModelID = defaultModelID;
        this.storage = storage;
        this.aiModelMgr = aiModelMgr;
        this.ready = this.storage.setAIInstanceModelID(userID, "chat", defaultModelID).then(() => {
        }).catch(err => {
            throw err;
        });
    }

    public getUserID(): string {
        return this.userID;
    }

    public static getInstance(context: vscode.ExtensionContext, userID: string, storage: Storage, defaultModelID: string, aiModelMgr: AIModelMgr): ChatManager {
        if (!ChatManager.instance) {
            ChatManager.instance = new ChatManager(context, userID, storage, defaultModelID, aiModelMgr);
        }
        return ChatManager.instance;
    }

    public async createSession(): Promise<ChatSession> {
        const currentTime = Date.now();
        const sessionId = currentTime.toString();
        const newSession: ChatSession = {
            id: sessionId,
            title: `新会话 ${new Date().toLocaleTimeString()}`,
            messages: [],
            createdAt: currentTime,
            lastActive: currentTime
        };
        
        this.currentSession = newSession;
        await this.saveSession(newSession);
        return newSession;
    }

    public getCurrentSession(): ChatSession | null {
        return this.currentSession;
    }

    public async loadSession(sessionId: string): Promise<ChatSession | null> {
        const sessions = await this.getAllSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            this.currentSession = session;
            return session;
        }
        return null;
    }

    public async deleteSession(sessionId: string): Promise<void> {
        const sessions = await this.getAllSessions();
        const filtered = sessions.filter(s => s.id !== sessionId);
        await this.context.globalState.update('chatSessions', filtered);
        
        if (this.currentSession?.id === sessionId) {
            this.currentSession = null;
        }
    }

    public async getAllSessions(): Promise<ChatSession[]> {
        return this.context.globalState.get<ChatSession[]>('chatSessions') || [];
    }

    public async saveSession(session: ChatSession): Promise<void> {
        const sessions = await this.getAllSessions();
        const existingIndex = sessions.findIndex(s => s.id === session.id);
        
        if (existingIndex >= 0) {
            sessions[existingIndex] = session;
        } else {
            sessions.push(session);
        }
        
        await this.context.globalState.update('chatSessions', sessions);
    }

    public async addMessageToSession(message: ChatMessage): Promise<void> {
        if (!this.currentSession) {
            await this.createSession();
        }
        
        if (this.currentSession) {
            this.currentSession.messages.push(message);
            this.currentSession.lastActive = Date.now();
            await this.saveSession(this.currentSession);
        }
    }

    public async updateSessionTitle(sessionId: string, title: string): Promise<void> {
        const sessions = await this.getAllSessions();
        const sessionIndex = sessions.findIndex(s => s.id === sessionId);
        
        if (sessionIndex >= 0) {
            sessions[sessionIndex].title = title;
            await this.context.globalState.update('chatSessions', sessions);
            
            if (this.currentSession?.id === sessionId) {
                this.currentSession.title = title;
            }
        }
    }

    public async chatStream(query: string, useKnowledge: boolean, toolsOn: boolean) {
        const history = await this.get_messages(query, this.userID);
        let modelID = await this.storage.getAIInstanceModelID(this.userID, 'chat');
        modelID = this.getValidModelID(modelID);

        const data: InputData = {
            userID: this.userID,
            message: history,
            toolsOn: toolsOn,
            useKnowledge: useKnowledge,
            modelConfig: this.aiModelMgr.getModelConfig(modelID),
            cache: await this.storage.getAIInstanceCache(this.userID, 'chat')
        };
        return this.aiModelMgr.chatStream(modelID, data);
    }

    private async get_messages(query: string, userID: string): Promise<Message[]> {
        const message: Message = { role: 'user', content: query };
        await this.storage.updateUserInfo(userID, message);
        const history = await this.storage.getAIInstanceMessages(userID, "chat", true ) || [];
        await this.storage.addAIChatContext(userID);
        let haveChatContext = await this.storage.getAIChatContext(userID);
        const num = Math.min(history.length, haveChatContext);
        
        let validNum = 0;
        let validStart = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user') {
                validStart = i;
                validNum++;
            }
            if (validNum >= num) break;
        }
        const messageContext = history.slice(validStart);
        this.insertDatetime(messageContext, 'user');
        
        console.info(`len(message_context): ${messageContext.length} total: ${
            messageContext.reduce((sum, msg) => sum + msg.content.length, 0)
        }`);
        
        return messageContext;
    }

    private insertDatetime(messages: Message[], user: string): void {
        const send_time = new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/\//g, '-');
        const system_tips: Message = {role: "system", content: `\n当前时间为：${send_time}\n`};

        if (messages.length > 0) {
            if (messages[0].role !== user) {
                messages[0].content += system_tips.content;
            } else {
                messages.unshift(system_tips);
            }
        } else {
            messages.push(system_tips);
        }
    }

    private getValidModelID(id?: string | undefined): string {
        if (id) {
            return id;
        } else {
            return this.defaultModelID;
        }
    }

    private getDefaultModel(): string {
        const config = vscode.workspace.getConfiguration('script-rule-chat');
        const models = config.get<any[]>('models', []);
        return models.length > 0 ? models[0].id : '';
    }
}