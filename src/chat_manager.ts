import * as vscode from 'vscode';
import { Message, InputData } from './core/ai_model/base/ai_types';
import { Storage } from './core/storage/storage';
import { Session } from './core/ai_model/base/ai_types';
import { AIModelMgr } from './core/ai_model/manager/ai_model_mgr';
import { getGlobalConfigValue } from './core/function/base_function';

export class ChatManager {
    private static instance: ChatManager;
    private context: vscode.ExtensionContext;
    private extensionName: string;
    private aiModelMgr: AIModelMgr;
    private userID: string = "";
    private storage: Storage;
    private defaultModelID: string = "";
    public ready: Promise<void>;

    private constructor(context: vscode.ExtensionContext, extensionName: string, userID: string, storage: Storage, defaultModelID: string, aiModelMgr: AIModelMgr) {
        this.context = context;
        this.extensionName = extensionName;
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

    public static getInstance(context: vscode.ExtensionContext, extensionName: string, userID: string, storage: Storage, defaultModelID: string, aiModelMgr: AIModelMgr): ChatManager {
        if (!ChatManager.instance) {
            ChatManager.instance = new ChatManager(context, extensionName, userID, storage, defaultModelID, aiModelMgr);
        }
        return ChatManager.instance;
    }

    public getSelectedAICharacter(): any {
        const selectedAICharacterId = getGlobalConfigValue<any>(this.extensionName, 'selectedAICharacter', {});
        const aiCharacterInfos = getGlobalConfigValue<any[]>(this.extensionName, 'aiCharacterInfos', []) || [];
        const characterInfo = aiCharacterInfos.find(info => info.id === selectedAICharacterId);
        return characterInfo;
    }

    public async getSession(instanceName: string, sessionId?: string): Promise<Session | undefined> {
        return await this.storage.getAIInstanceSession(this.userID, instanceName, sessionId);
    }

    public async selectSession(instanceName: string, sessionId: string): Promise<Session | undefined> {
        await this.storage.setAIInstanceSelectedSession(this.userID, instanceName, sessionId);
        return await this.storage.getAIInstanceSession(this.userID, instanceName);
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

    public async setContextExpand(instanceName: string, sessionId: string | undefined, index: number, expand?: boolean) {
        return await this.storage.setConextExpand(this.userID, instanceName, sessionId, index, expand);
    }

    public async removeMessages(instanceName: string, removeIndexList: number[], sessionId?: string): Promise<Session | undefined> {
        return await this.storage.removeAIInstanceMessages(this.userID, instanceName, sessionId, removeIndexList);
    }

    public async chatStream(signal: AbortSignal, session: Session, useKnowledge: boolean, toolsOn: boolean, query?: string, index?: number, contextOption?: any[], contextExpand?: boolean) {
        const history = await this.getMessages(this.userID, 'chat', session.sessionId, query, index, contextOption, contextExpand);
        let modelID = await this.storage.getAIInstanceModelID(this.userID, 'chat');
        modelID = this.getValidModelID(modelID);

        const data: InputData = {
            userID: this.userID,
            instanceName: 'chat',
            session: session,
            history: history,
            index: index,
            toolsOn: toolsOn,
            useKnowledge: useKnowledge,
            modelConfig: this.aiModelMgr.getModelConfig(modelID),
            cache: await this.storage.getAIInstanceCache(this.userID, 'chat')
        };
        return this.aiModelMgr.chatStream(signal, modelID, data);
    }

    private async getMessages(userID: string, instanceName: string, sessionId?: string, query?: string, index?: number, contextOption?: any[], contextExpand?: boolean): Promise<Message[]> {
        let message: Message;
        let history: Message[];
        if (index != undefined) {
            if (query) {
                message = { role: 'user', content: query as string, timestamp: Date.now(), contextOption: contextOption, contextExpand: contextExpand };
                await this.storage.updateUserInfo(userID, instanceName, sessionId, message, undefined, true, index);
            }
            history = await this.storage.getAIInstanceMessages(userID, instanceName, sessionId, true ) || [];
        } else {
            message = { role: 'user', content: query as string, timestamp: Date.now(), contextOption: contextOption, contextExpand: contextExpand };
            await this.storage.updateUserInfo(userID, instanceName, sessionId, message);
            history = await this.storage.getAIInstanceMessages(userID, instanceName, sessionId, true ) || [];
            await this.storage.addAIRound(userID, instanceName, sessionId);
        }
        let round = await this.storage.getAIRound(userID, instanceName, sessionId);
        const num = Math.min(history.length, round);
        
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
        const aiCharacter = this.getSelectedAICharacter();
        const sendTime = new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/\//g, '-');
        const systemTips: Message = {role: "system", content: `\n${aiCharacter.describe}\n当前时间为：${sendTime}\n`, timestamp: Date.now()};
        if (messages.length > 0) {
            if (messages[0].role !== user) {
                messages[0].content = systemTips.content;
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