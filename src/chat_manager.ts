import * as vscode from 'vscode';
import { Message, InputData } from './core/ai_model/base/ai_types';
import { Storage } from './core/storage/storage';
import { Session } from './core/ai_model/base/ai_types';
import { AIModelMgr } from './core/ai_model/manager/ai_model_mgr';

export class ChatManager {
    private static instance: ChatManager;
    private context: vscode.ExtensionContext;
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
        this.ready = this.aiModelMgr.setSelectedModel(defaultModelID, userID).then(() => {
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

    public async getSelectedSession(instanceName: string): Promise<Session | undefined> {
        return await this.storage.getAIInstanceSelectedSession(this.userID, instanceName);
    }

    public async selectSession(instanceName: string, sessionId: string): Promise<Session | undefined> {
        await this.storage.setAIInstanceSelectedSession(this.userID, instanceName, sessionId);
        return await this.storage.getAIInstanceSelectedSession(this.userID, instanceName);
    }

    public async addSession(instanceName: string): Promise<Session | undefined> {
        return await this.storage.addAIInstanceSession(this.userID, instanceName);
    }

    public async removeSession(instanceName: string, sessionId: string): Promise<Session | undefined> {
        return await this.storage.removeAIInstanceSession(this.userID, instanceName, sessionId);
    }

    public async getAllSessionsSnapshot(instanceName: string): Promise<any[]> {
        return this.storage.getAIInstanceSessionsSnapshot(this.userID, instanceName);
    }

    public async setSessionName(instanceName: string, sessionId: string, sessionName: string): Promise<Session | undefined> {
        return await this.storage.setAIInstanceSessionName(this.userID, instanceName, sessionId, sessionName);
    }

    public async chatStream(query: string, useKnowledge: boolean, toolsOn: boolean) {
        const history = await this.getMessages(query, this.userID);
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

    private async getMessages(query: string, userID: string): Promise<Message[]> {
        const message: Message = { role: 'user', content: query, timestamp: Date.now() };
        await this.storage.updateUserInfo(userID, message);
        const history = await this.storage.getAIInstanceMessages(userID, "chat", true ) || [];
        await this.storage.addAIRound(userID, 'chat');
        let haveChatContext = await this.storage.getAIRound(userID, 'chat');
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
        const systemTips: Message = {role: "system", content: `\n当前时间为：${send_time}\n`, timestamp: Date.now()};
        if (messages.length > 0) {
            if (messages[0].role !== user) {
                messages[0].content += systemTips.content;
            } else {
                messages.unshift(systemTips);
            }
        } else {
            messages.push(systemTips);
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