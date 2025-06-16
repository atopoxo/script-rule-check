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

interface Message {
    role: string;
    content: string;
}

interface Session {
    timestamp: number;
    name: string;
    have_chat_context: number;
    messages_history: Message[];
    cache: Cache;
}

interface AIInstance {
    sessions: Record<string, Session>;
    selected_session_id: string;
    default_session_id: string;
    model_id?: string;
}

interface UserInfo {
    ai_config: Record<string, any>;
    ai_instance: Record<string, AIInstance>;
}

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
        const aiConfigs = userInfo.ai_config;
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
            aiInstance.model_id = modelID;
        }
    }

    public async getAIInstanceModelID(userId: string, instanceName: string): Promise<string | undefined> {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        return (aiInstance && aiInstance.model_id) ? aiInstance.model_id : undefined;
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

    public async addAIInstanceSession(userId: string, instanceName: string, sessionId: string, name: string, timestamp: number) {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            await this.addSession(aiInstance, sessionId, null, name, timestamp);
        }
        const userInfo = await this.getUserInfo(userId);
        if (userInfo) {
            await this.saveUserInfo(userId, userInfo);
        }
    }

    public async removeAIInstanceSession(userId: string, instanceName: string, sessionId: string, name: string, timestamp: number) {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            await this.removeSession(aiInstance, sessionId);
        }
        const userInfo = await this.getUserInfo(userId);
        if (userInfo) {
            await this.saveUserInfo(userId, userInfo);
        }
    }

    public async removeAIInstanceMessages(userId: string, instanceName: string) {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            const selectedSessionId = aiInstance.selected_session_id;
            const sessionInfo = await this.getSession(aiInstance, selectedSessionId);
            sessionInfo.messages_history = [];
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
            const selectedSessionId = aiInstance.selected_session_id;
            const sessionInfo = await this.getSession(aiInstance, selectedSessionId);
            sessionInfo.cache = this.getDefaultCache();
            // await this.saveSession(userId, instanceName, selectedSessionId, sessionInfo);
            const userInfo = await this.getUserInfo(userId);
            if (userInfo) {
                await this.saveUserInfo(userId, userInfo);
            }
        }
    }

    public async updateUserInfo(userId: string, message?: Message, cache?: Partial<Cache>, messageReplace: boolean = false) {
        if (message) {
            const messages = await this.getAIInstanceMessages(userId, "chat");
            if (messages) {
                if (messageReplace && messages.length > 0) {
                    messages[messages.length - 1] = message;
                } else {
                    messages.push(message);
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

    public async getAIInstanceMessages(userId: string, instanceName: string, deepCopy: boolean = false): Promise<Message[] | null> {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (!aiInstance) {
            return null;
        }
        const sessionInfo = await this.getSession(aiInstance);
        return deepCopy ? this.jsonParser.parse(this.jsonParser.toJsonStr(sessionInfo.messages_history)) : sessionInfo.messages_history;
    }

    public async getAIInstanceCache(userId: string, instanceName: string): Promise<Cache> {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (!aiInstance) {
            return this.getDefaultCache();
        }
        const sessionInfo = await this.getSession(aiInstance);
        return sessionInfo.cache;
    }

    public async getAIInstanceSessions(userId: string, instanceName: string, attributes: string[] = ["id", "selected", "name"]): Promise<Record<string, any>[]> {
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
                info["selected"] = (sessionId === aiInstance.selected_session_id);
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

    public async selectAIInstanceSession(userId: string, instanceName: string, sessionId: string) {
        const aiInstance = await this.getAIIInstance(userId, instanceName);
        if (aiInstance) {
            aiInstance.selected_session_id = sessionId;
        }
    }

    public async getAIChatContext(userId: string): Promise<number> {
        const aiInstance = await this.getAIIInstance(userId, 'chat');
        if (!aiInstance) {
            return 1;
        }
        const sessionInfo = await this.getSession(aiInstance);
        return sessionInfo.have_chat_context;
    }

    public async addAIChatContext(userId: string) {
        const aiInstance = await this.getAIIInstance(userId, 'chat');
        if (aiInstance) {
            const sessionInfo = await this.getSession(aiInstance);
            sessionInfo.have_chat_context += 1;
            // await this.saveSession(userId, 'chat', aiInstance.selected_session_id, sessionInfo);
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
        const aiInstances = userInfo.ai_instance;
        return aiInstances[instanceName] || null;
    }

    private newUserDict(timestamp: number): UserInfo {
        const sessionId = crypto.randomUUID();
        const chatDict: AIInstance = {
            sessions: {
                [sessionId]: this.newChatDict("默认对话", timestamp)
            },
            selected_session_id: sessionId,
            default_session_id: sessionId
        };
        
        return {
            ai_config: {},
            ai_instance: {
                'chat': chatDict
            }
        };
    }

    private newChatDict(name: string, timestamp: number): Session {
        return {
            timestamp,
            name,
            have_chat_context: 0,
            messages_history: [{ role: "system", content: PROJECT_INFO }],
            cache: this.getDefaultCache()
        };
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

    private async getSession(aiInstance: AIInstance, sessionId?: string): Promise<Session> {
        const selectedSessionId = sessionId || aiInstance.selected_session_id;
        return aiInstance.sessions[selectedSessionId];
    }

    private async addSession(aiInstance: AIInstance, sessionId: string, sessionData: Session | null, name: string, time: number) {
        aiInstance.selected_session_id = sessionId;
        aiInstance.sessions[sessionId] = sessionData || this.newChatDict(name, time);
    }

    private async removeSession(aiInstance: AIInstance, sessionId?: string) {
        const finalSessionId = sessionId || aiInstance.selected_session_id;
        delete aiInstance.sessions[finalSessionId];
    }
}