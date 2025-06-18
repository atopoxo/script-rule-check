import { singleton } from 'tsyringe';
import { Pool } from 'pg';
import Database from 'better-sqlite3';
type SqliteDatabase = InstanceType<typeof Database>;
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { Mutex } from 'async-mutex';
import { Cache, ToolTip } from '../ai_model/base/ai_types';
import { getJsonParser } from '../json/json_parser';
import { Message, Session, AIInstance, UserInfo } from '../ai_model/base/ai_types'

const PROJECT_INFO = "你是一个帮助人类解决问题的AI智能体\n";

@singleton()
export class Storage {
    private jsonParser = getJsonParser();
    private userCache: UserInfo | undefined = undefined;
    private localDB: SqliteDatabase | null = null;
    private remoteDB: Pool | null = null;
    private remoteDBConnected: boolean = false;
    private lock = new Mutex();
    private config: any;
    private userID: string;
    private dbPath: string;
    public ready: Promise<void>; 

    constructor(config: any, userID: string, dbPath: string) {
        this.config = config;
        this.userID = userID;
        this.dbPath = dbPath;
        this.ready = this.initDatabases().then(() => {
        }).catch(err => {
            throw err;
        });
    }

    public async getAIConfig(userId: string, configName: string, create: boolean = false): Promise<any> {
        const userInfo = await this.getUserInfo(userId);
        if (!userInfo) {
            return null;
        }
        const aiConfigs = userInfo.aiConfig;
        if (configName in aiConfigs) {
            return aiConfigs[configName];
        }
        if (create) {
            aiConfigs[configName] = {};
            return aiConfigs[configName];
        }
        return null;
    }

    public async setAIInstanceModelID(userId: string, instanceName: string, modelID: string) {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            aiInstance.modelId = modelID;
        }
    }

    public async getAIInstanceModelID(userId: string, instanceName: string): Promise<string | undefined> {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        return (aiInstance && aiInstance.modelId) ? aiInstance.modelId : undefined;
    }

    public async createUserInfo(userId: string, timestamp: number) {
        const release = await this.acquireLock();
        try {
            const userDict = this.newUserDict(timestamp);
            this.userCache = userDict;
            await this.saveUserInfo(userId, userDict);
            console.log("创建新的用户id:\t", userId);
        } finally {
            release();
        }
    }

    public async destroyUserInfo(userId: string) {
        const release = await this.acquireLock();
        try {
            this.userCache = undefined;
            if (this.remoteDB) {
                await this.remoteDB.query('DELETE FROM users WHERE user_id = $1', [userId]);
            }
            if (this.localDB) {
                const stmt = this.localDB.prepare('DELETE FROM users WHERE user_id = ?');
                stmt.run(userId);
            }
            this.userCache = undefined;
            console.log("删除用户id:\t", userId);
        } finally {
            release();
        }
    }

    public async getUserInfo(userId: string): Promise<UserInfo | undefined> {
        let userInfo: UserInfo | undefined = undefined;
        const release = await this.acquireLock();
        try {
            if (this.userCache) {
                return this.userCache;
            }
            const userInfo = await this.loadUser(userId);
            if (userInfo) {
                this.userCache = userInfo;
            }
        } finally {
            release();
        }
        return userInfo;
    }

    public async addAIInstanceSession(userId: string, instanceName: string): Promise<Session | undefined> {
        let session = undefined;
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            const sessionId = crypto.randomUUID();
            session = await this.createAIInstanceSession(sessionId, "当前对话", Date.now());
            await this.setAIInstanceSession(aiInstance, sessionId, session);
            await this.setAIInstanceSelectedSession(userId, instanceName, sessionId);
        }
        const userInfo = await this.getUserInfo(userId);
        if (userInfo) {
            await this.saveUserInfo(userId, userInfo);
        }
        return session;
    }

    public async removeAIInstanceSession(userId: string, instanceName: string, sessionId: string): Promise<Session | undefined> {
        let session = undefined;
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            await this.destroyAIInstanceSession(aiInstance, sessionId);
            session = await this.getAIInstanceSelectedSession(userId, instanceName);
            if (!session) {
                session = await this.addAIInstanceSession(userId, instanceName);
            }
        }
        const userInfo = await this.getUserInfo(userId);
        if (userInfo) {
            await this.saveUserInfo(userId, userInfo);
        }
        return session;
    }

    public async getAIInstanceSessionsSnapshot(userId: string, instanceName: string, attributes: string[] = ["id", "selected", "name"]): Promise<Record<string, any>[]> {
        const result: Record<string, any>[] = [];
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (!aiInstance) {
            return result;
        }
        for (const [sessionId, sessionInfo] of Object.entries(aiInstance.sessions)) {
            const info: Record<string, any> = {};
            if (attributes.includes("id")) {
                info["id"] = sessionId;
            }
            if (attributes.includes("selected")) {
                info["selected"] = (sessionId === aiInstance.selectedSessionId);
            }
            for (const [key, value] of Object.entries(sessionInfo)) {
                if (attributes.includes(key)) {
                    info[key] = value;
                }
            }
            result.push(info);
        }
        return result;
    }

    public async setAIInstanceSelectedSession(userId: string, instanceName: string, sessionId: string) {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            aiInstance.selectedSessionId = sessionId;
        }
    }

    public async getAIInstanceSelectedSession(userId: string, instanceName: string): Promise<Session | undefined> {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            return this.getAIInstanceSession(aiInstance, aiInstance.selectedSessionId);
        }
        return undefined;
    }

    public async setAIInstanceSessionName(userId: string, instanceName: string, sessionId: string, name: string): Promise<Session | undefined> {
        let session = undefined;
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            session = await this.getAIInstanceSession(aiInstance, sessionId);
            if (session) {
                session.name = name;
            }
        }
        return session;
    }

    public async removeAIInstanceMessages(userId: string, instanceName: string) {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            const sessionInfo = await this.getAIInstanceSession(aiInstance, aiInstance.selectedSessionId);
            sessionInfo.history = [];
            // await this.saveSession(userId, instanceName, selectedSessionId, sessionInfo);
            const userInfo = await this.getUserInfo(userId);
            if (userInfo) {
                await this.saveUserInfo(userId, userInfo);
            }
        }
    }

    public async removeAIInstanceCache(userId: string, instanceName: string) {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            const sessionInfo = await this.getAIInstanceSession(aiInstance, aiInstance.selectedSessionId);
            sessionInfo.cache = this.getDefaultCache();
            // await this.saveSession(userId, instanceName, selectedSessionId, sessionInfo);
            const userInfo = await this.getUserInfo(userId);
            if (userInfo) {
                await this.saveUserInfo(userId, userInfo);
            }
        }
    }

    public async updateUserInfo(userId: string, message?: Message, cache?: Partial<Cache>, messageReplace: boolean = false, index: number = -1) {
        if (message) {
            const messages = await this.getAIInstanceMessages(userId, "chat");
            if (messages) {
                if (messageReplace && messages.length > 0) {
                    messages[index] = message;
                } else {
                    if (index == -1 || index >= messages.length) {
                        messages.push(message);
                    } else {
                        messages[index] = message;
                    }
                }
            }
        }
        if (cache) {
            const currentCache = await this.getAIInstanceCache(userId, "chat");
            Object.assign(currentCache, cache);
        }
        const userInfo = await this.getUserInfo(userId);
        if (userInfo) {
            await this.saveUserInfo(userId, userInfo);
        }
    }

    public async getAIInstanceMessages(userId: string, instanceName: string, deepCopy: boolean = false): Promise<Message[] | undefined> {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (!aiInstance) {
            return undefined;
        }
        const sessionInfo = await this.getAIInstanceSession(aiInstance, aiInstance.selectedSessionId);
        return deepCopy ? this.jsonParser.parse(this.jsonParser.toJsonStr(sessionInfo.history)) : sessionInfo.history;
    }

    public async getAIInstanceCache(userId: string, instanceName: string): Promise<Cache> {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (!aiInstance) {
            return this.getDefaultCache();
        }
        const sessionInfo = await this.getAIInstanceSession(aiInstance, aiInstance.selectedSessionId);
        return sessionInfo.cache;
    }

    public async getAIRound(userId: string, instanceName: string): Promise<number> {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (!aiInstance) {
            return 1;
        }
        const sessionInfo = await this.getAIInstanceSession(aiInstance, aiInstance.selectedSessionId);
        return sessionInfo.round;
    }

    public async addAIRound(userId: string, instanceName: string) {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            const sessionInfo = await this.getAIInstanceSession(aiInstance, aiInstance.selectedSessionId);
            sessionInfo.round += 1;
            // await this.saveSession(userId, 'chat', aiInstance.selectedSessionId, sessionInfo);
            const userInfo = await this.getUserInfo(userId);
            if (userInfo) {
                await this.saveUserInfo(userId, userInfo);
            }
        }
    }

    private async initDatabases() {
        const dbDir = path.dirname(this.config.localDBPath || this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        this.localDB = new Database(this.dbPath);
        this.setupLocalDatabase();
        const localUsers = this.getAllLocalUsers();
        for (const user of localUsers) {
            if (this.userID == user.user_id) {
                this.userCache = this.jsonParser.parse(user.data.toString());
            }
        }
        if (this.config.remoteDB) {
            this.remoteDB = new Pool(this.config.remoteDB);
            try {
                await this.remoteDB.query('SELECT 1');
                this.remoteDBConnected = true;
                console.log("Connected to remote PostgreSQL database");
                await this.syncLocalToRemote(localUsers);
            } catch (err) {
                console.error("Remote database connection failed, using local storage", err);
                this.remoteDBConnected = false;
            }
        }
        if (this.userCache === undefined) {
            this.createUserInfo(this.userID,  Date.now());
        }
    }

    private getUserTabelDBText(blobType: string = 'BLOB') {
        return `
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                data ${blobType} NOT NULL
            )
        `;
    }

    // private getSessionTableDBText(blobType: string = 'BLOB') {
    //     return `
    //         CREATE TABLE IF NOT EXISTS sessions (
    //             user_id TEXT NOT NULL,
    //             instance_name TEXT NOT NULL,
    //             session_id TEXT NOT NULL,
    //             data ${blobType} NOT NULL,
    //             PRIMARY KEY (user_id, instance_name, session_id),
    //             FOREIGN KEY(user_id) REFERENCES users(user_id)
    //         )
    //     `;
    // }

    private setupLocalDatabase() {
        if (!this.localDB) {
            return;
        }
        try {
            const sql = this.getUserTabelDBText('BLOB');
            this.localDB.exec(sql);
        } catch (err) {
            console.error("创建本地数据库表失败:", err);
            throw err;
        }
    }

    private async syncLocalToRemote(localUsers: { user_id: string; data: Buffer }[]) {
        if (!this.remoteDBConnected || !this.remoteDB) {
            return;
        }
        try {
            await this.remoteDB.query(this.getUserTabelDBText('BYTEA'));
            // await this.remoteDB.query(this.getSessionTableDBText('BYTEA'));
            for (const user of localUsers) {
                await this.saveUserInfoToRemote(user.user_id, user.data);
            }
            console.log("Local data synchronized to remote database");
        } catch (err) {
            console.error("Failed to sync local data to remote", err);
        }
    }

    private getAllLocalUsers(): { user_id: string; data: Buffer }[] {
        if (!this.localDB) {
            return [];
        }
        const stmt = this.localDB.prepare("SELECT user_id, data FROM users");
        return stmt.all() as { user_id: string; data: Buffer }[];
    }

    private async saveUserInfoToRemote(userId: string, data: Buffer) {
        if (!this.remoteDB) {
            return;
        }
        await this.remoteDB.query(
            `INSERT INTO users (user_id, data) VALUES ($1, $2)
             ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data`,
            [userId, data]
        );
    }

    // private async saveSessionToRemote(userId: string, instanceName: string, sessionId: string, data: Buffer) {
    //     if (!this.remoteDB) {
    //         return;
    //     }
    //     await this.remoteDB.query(
    //         `INSERT INTO sessions (user_id, instance_name, session_id, data) 
    //          VALUES ($1, $2, $3, $4)
    //          ON CONFLICT (user_id, instance_name, session_id)
    //          DO UPDATE SET data = EXCLUDED.data`,
    //         [userId, instanceName, sessionId, data]
    //     );
    // }

    private async loadUser(userId: string): Promise<UserInfo | null> {
        if (this.remoteDBConnected && this.remoteDB) {
            try {
                const res = await this.remoteDB.query(
                    'SELECT data FROM users WHERE user_id = $1', 
                    [userId]
                );
                if (res.rows.length > 0) {
                    return res.rows[0].data as UserInfo;
                }
            } catch (err) {
                console.error("Failed to load user from remote", err);
            }
        }
        if (this.localDB) {
            try {
                const stmt = this.localDB.prepare('SELECT data FROM users WHERE user_id = ?');
                const row = stmt.get(userId) as { data: UserInfo } || null;
                return row ? row.data as UserInfo : null;
            } catch (err) {
                console.error("Failed to load user from local", err);
            }
        }
        return null;
    }

    private async saveUserInfo(userId: string, data: UserInfo) {
        const serialized = this.jsonParser.toJsonStr(data);
        if (this.remoteDBConnected && this.remoteDB) {
            try {
                await this.saveUserInfoToRemote(userId, Buffer.from(serialized));
            } catch (err) {
                console.error("Failed to save user to remote", err);
                this.remoteDBConnected = false;
            }
        }
        if (this.localDB) {
            try {
                const stmt = this.localDB.prepare(
                    `INSERT OR REPLACE INTO users (user_id, data) VALUES (?, ?)`
                );
                stmt.run(userId, Buffer.from(serialized));
            } catch (err) {
                console.error("Failed to save user to local", err);
            }
        }
    }

    // private async saveSession(userId: string, instanceName: string, sessionId: string, session: Session) {
    //     const serialized = this.jsonParser.toJsonStr(session);
    //     if (this.remoteDBConnected && this.remoteDB) {
    //         try {
    //             await this.saveSessionToRemote(userId, instanceName, sessionId, Buffer.from(serialized));
    //         } catch (err) {
    //             console.error("Failed to save session to remote", err);
    //         }
    //     }
    //     if (this.localDB) {
    //         try {
    //             await new Promise<void>((resolve, reject) => {
    //                 this.localDB!.run(
    //                     `INSERT OR REPLACE INTO sessions (session_id, user_id, instance_name, data) 
    //                      VALUES (?, ?, ?, ?)`,
    //                     [sessionId, userId, instanceName, Buffer.from(serialized)],
    //                     (err: any) => {
    //                         if (err) {
    //                             reject(err);
    //                         } else {
    //                             resolve();
    //                         }
    //                     }
    //                 );
    //             });
    //         } catch (err) {
    //             console.error("Failed to save session to local", err);
    //         }
    //     }
    // }

    private async acquireLock() {
        const release = await this.lock.acquire();
        return release;
    }

    private async getAIIInstance(userId: string, instanceName: string): Promise<AIInstance | null> {
        const userInfo = await this.getUserInfo(userId);
        if (!userInfo) {
            return null;
        }
        const aiInstances = userInfo.aiInstance;
        return aiInstances[instanceName] || null;
    }

    private newUserDict(timestamp: number): UserInfo {
        const sessionId = crypto.randomUUID();
        const chatInstance: AIInstance = {
            sessions: {
                [sessionId]: this.createAIInstanceSession(sessionId, "默认对话", timestamp)
            },
            selectedSessionId: sessionId
        };
        
        return {
            aiConfig: {},
            aiInstance: {'chat': chatInstance}
        };
    }

    private createAIInstanceSession(sessionId: string, name: string, timestamp: number): Session {
        return {
            sessionId: sessionId,
            lastModifiedTimestamp: timestamp,
            name: name,
            round: 0,
            history: [this.createAIIInstanceMessage(timestamp)],
            cache: this.getDefaultCache()
        };
    }

    private createAIIInstanceMessage(timestamp: number): Message {
        const sendTime = new Date(timestamp).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/\//g, '-');
        return { 
            role: "system", 
            content: `\n当前时间为：${sendTime}\n` ,
            timestamp: timestamp
        }
    }

    private getDefaultCache(): Cache {
        const toolsDescribe: ToolTip = { tools_usage: "", tools_describe: "" };
        return {
            tools_describe: toolsDescribe,
            tool_calls: [],
            knowledge: "",
            backup: "",
            returns: { ai: { ai_conclusion: "" } }
        };
    }

    private async getAIInstanceSession(aiInstance: AIInstance, sessionId: string): Promise<Session> {
        return aiInstance.sessions[sessionId];
    }

    private async setAIInstanceSession(aiInstance: AIInstance, sessionId: string, sessionData: Session) {
        aiInstance.sessions[sessionId] = sessionData;
    }

    private async destroyAIInstanceSession(aiInstance: AIInstance, sessionId: string) {
        delete aiInstance.sessions[sessionId];
    }
}