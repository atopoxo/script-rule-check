import * as vscode from 'vscode';

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

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public static getInstance(context: vscode.ExtensionContext): ChatManager {
        if (!ChatManager.instance) {
            ChatManager.instance = new ChatManager(context);
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

    private getDefaultModel(): string {
        const config = vscode.workspace.getConfiguration('script-rule-chat');
        const models = config.get<any[]>('models', []);
        return models.length > 0 ? models[0].id : '';
    }
}