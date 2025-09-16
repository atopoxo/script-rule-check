import * as vscode from 'vscode';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';

const iconv = require('iconv-lite');

enum LuaValueDef {
    eLuaPackNumber = 0,
    eLuaPackBoolean = 1,
    eLuaPackString = 2,
    eLuaPackNill = 3,
    eLuaPackTable = 4
}

const e2l_remote_lua_call_def = 202;
const SOCKET_PORT = 10088;
const SOCKET_HOST = 'localhost';
const GC_BRIDGE_NAME = 'GCBridgeX64.exe';

export class GCClient {
    private isConnected: boolean = false;
    private socket: net.Socket | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private subProcessPath: string;
    private processName: string;
    private subProcess: child_process.ChildProcess | null = null;
    
    constructor() {
        this.subProcessPath = path.join(__dirname, '../../../../', 'assets/bin', 'GCBridgeX64.exe');
        this.processName = path.basename(this.subProcessPath);
        this.subProcess = null;
    }

    public async connect(): Promise<boolean> {
        try {
            if (!this.socket) {
                const isProcessRunning = await this.checkProcessExists();
                if (isProcessRunning) {
                    console.log(`${GC_BRIDGE_NAME} is already running`);
                } else {
                    const processStarted = this.startProcess();
                    if (!processStarted) {
                        return false;
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                return await this.connectViaSocket();
            } else {
                return true;
            }
        } catch (error: any) {
            console.error(`Cannot connect to ${GC_BRIDGE_NAME}:`, error);
            vscode.window.showErrorMessage(`Cannot connect to ${GC_BRIDGE_NAME}: ${error.message}`);
            return false;
        }
    }

    public async close() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.socket) {
            this.socket.end();
            this.socket = null;
        }
        
        this.isConnected = false;
        console.log(`Disconnected from ${GC_BRIDGE_NAME}`);

        const isProcessRunning = await this.checkProcessExists();
        if (isProcessRunning) {
            console.log(`${GC_BRIDGE_NAME} is running try close`);
            await this.killExistingProcess();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    public async doRemoteLuaCall(functionName: string, paramString: string): Promise<boolean> {
        if (!this.isConnected) {
            const connected = await this.connect();
            if (!connected) {
                vscode.window.showErrorMessage(`Not connected to ${GC_BRIDGE_NAME}`);
                return false;
            }
        }

        try {
            const wProtocol = 0;
            const wServer = 1;
            const wSubProtocol = e2l_remote_lua_call_def;
            const packet = this.getRemoteLuaCallPacket(wProtocol, wServer, wSubProtocol, functionName, paramString);
            
            if (this.socket) {
                this.socket.write(packet);
                console.log(`Lua call sent to ${GC_BRIDGE_NAME} via socket`);
                return true;
            } else {
                this.isConnected = false;
                return await this.doRemoteLuaCall(functionName, paramString);
            }
        } catch (error) {
            console.error('Error creating packet:', error);
            return false;
        }
    }

    private async checkProcessExists(): Promise<boolean> {
        return new Promise((resolve) => {
            const command = process.platform === 'win32' 
                ? `tasklist /fi "imagename eq ${this.processName}"` 
                : `ps -A | grep ${this.processName}`;
            
            child_process.exec(command, (error, stdout, stderr) => {
                if (error) {
                    resolve(false);
                    return;
                }
                const exists = stdout.includes(this.processName);
                resolve(exists);
            });
        });
    }

    private async killExistingProcess(): Promise<boolean> {
        return new Promise((resolve) => {
            const command = process.platform === 'win32' 
                ? `taskkill /f /im ${this.processName}` 
                : `pkill -f ${this.processName}`;
            
            child_process.exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error killing process:', error);
                    resolve(false);
                    return;
                }
                
                console.log('Process killed successfully');
                resolve(true);
            });
        });
    }

    private async startProcess(): Promise<boolean> {
        try {
            if (!fs.existsSync(this.subProcessPath)) {
                throw new Error(`${GC_BRIDGE_NAME} executable not found at: ${this.subProcessPath}`);
            }

            // 启动新的C++进程
            this.subProcess = child_process.spawn(this.subProcessPath, [], {
                stdio: 'ignore',
                detached: true
            });

            this.subProcess.on('error', (err) => {
                console.error(`${GC_BRIDGE_NAME} error:`, err);
                this.subProcess = null;
            });

            this.subProcess.on('exit', (code) => {
                console.log(`${GC_BRIDGE_NAME} exited with code ${code}`);
                this.subProcess = null;
                this.isConnected = false;
                
                this.close();
            });

            this.isConnected = true;
            console.log(`Started new ${GC_BRIDGE_NAME} successfully`);
            return true;
        } catch (error: any) {
            console.error(`Failed to start ${GC_BRIDGE_NAME}:`, error);
            this.isConnected = false;
            this.subProcess = null;
            return false;
        }
    }

    private async connectViaSocket(): Promise<boolean> {
        return new Promise((resolve) => {
            this.socket = net.createConnection({ port: SOCKET_PORT, host: SOCKET_HOST }, () => {
                this.isConnected = true;
                console.log(`Connected to ${GC_BRIDGE_NAME} via socket`);
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                resolve(true);
            });

            this.socket.on('data', (data) => {
                console.log(`Received from ${GC_BRIDGE_NAME}: ${data}`);
            });

            this.socket.on('error', (err) => {
                console.error('Socket error:', err);
                this.isConnected = false;
                resolve(false);
            });

            this.socket.on('close', () => {
                console.log('Socket connection closed');
                this.isConnected = false;
                this.socket = null;
                
                // 尝试重新连接
                if (!this.reconnectTimer) {
                    this.reconnectTimer = setTimeout(() => {
                        console.log('Attempting to reconnect...');
                        this.connectViaSocket();
                    }, 3000);
                }
            });
        });
    }

    private getRemoteLuaCallPacket(wProtocol: number, wServer: number, wSubProtocol: number, functionName: string, paramString: string): Buffer {
        const params = this.parseParameters(paramString);
        const paramBuffers: Buffer[] = [];

        for (const param of params) {
            this.encodeParameter(param, paramBuffers);
        }
        const paramData = Buffer.concat(paramBuffers);
        
        const headerPackSize = 4;
        const headerSize = headerPackSize + 6;
        const fixedSize = headerSize + 32 + 4;
        const totalSize = fixedSize + paramData.length;
        const buffer = Buffer.alloc(totalSize, 0);

        buffer.writeUInt16LE(totalSize - headerPackSize, 0);
        buffer.writeUInt16LE(wProtocol, 4);
        buffer.writeUInt16LE(wServer, 6);
        buffer.writeUInt16LE(wSubProtocol, 8);

        const funcBuf = Buffer.from(functionName, 'ascii');
        const funcLen = Math.min(funcBuf.length, 31);
        funcBuf.copy(buffer, headerSize, 0, funcLen);

        buffer.writeUInt32LE(paramData.length, headerSize + 32);
        paramData.copy(buffer, fixedSize);

        return buffer;
    }

    private parseParameters(paramString: string): any[] {
        const result: any[] = [];
        let current = '';
        let depth = 0;
        
        for (let i = 0; i < paramString.length; i++) {
            const ch = paramString[i];
            if (ch === '{' && depth === 0) {
                // 开始表结构
                if (current) {
                    result.push(current);
                    current = '';
                }
                depth++;
                current += ch;
            } else if (ch === '}' && depth > 0) {
                // 结束表结构
                depth--;
                current += ch;
                if (depth === 0) {
                    try {
                        // 尝试解析为JSON对象
                        const table = JSON.parse(current);
                        result.push(table);
                        current = '';
                    } catch (e) {
                        // 解析失败，作为普通字符串处理
                        result.push(current);
                        current = '';
                    }
                }
            } else if (ch === ',' && depth === 0) {
                // 普通参数分隔符
                if (current) {
                    result.push(current);
                    current = '';
                }
            } else {
                current += ch;
            }
        }
        
        if (current) {
            result.push(current);
        }
        
        return result;
    }

    private encodeParameter(param: any, buffers: Buffer[]): void {
        if (!isNaN(Number(param)) && typeof param !== 'boolean') {
            buffers.push(Buffer.from([LuaValueDef.eLuaPackNumber]));
            const numBuf = Buffer.alloc(8);
            numBuf.writeDoubleLE(Number(param));
            buffers.push(numBuf);
        } else if (param === 'true' || param === 'false' || typeof param === 'boolean') {
            buffers.push(Buffer.from([LuaValueDef.eLuaPackBoolean]));
            const boolValue = param === 'true' || param === true;
            buffers.push(Buffer.from([boolValue ? 1 : 0]));
        } else if (param === 'nil' || param === null) {
            buffers.push(Buffer.from([LuaValueDef.eLuaPackNill]));
        } else if (typeof param === 'object') {
            buffers.push(Buffer.from([LuaValueDef.eLuaPackTable]));
            
            // 写入表元素数量
            const keyCount = Object.keys(param).length;
            const countBuf = Buffer.alloc(4);
            countBuf.writeUInt32LE(keyCount);
            buffers.push(countBuf);
            
            // 递归编码每个键值对
            for (const key in param) {
                if (param.hasOwnProperty(key)) {
                    // 编码键
                    this.encodeParameter(key, buffers);
                    // 编码值
                    this.encodeParameter(param[key], buffers);
                }
            }
        } else {
            const strValue = String(param);
            buffers.push(Buffer.from([LuaValueDef.eLuaPackString]));
            
            // const lenBuf = Buffer.alloc(4);
            // lenBuf.writeUInt32LE(strBuf.length + 1); // 包含null终止符
            // buffers.push(lenBuf);
            // const strBufWithoutNull = Buffer.from(strValue, 'utf8');
            const strBufWithoutNull = iconv.encode(strValue, 'gbk');
            const strBuffer = Buffer.alloc(strBufWithoutNull.length + 1, 0);
            strBufWithoutNull.copy(strBuffer, 0);
            buffers.push(strBuffer);
        }
    }
}