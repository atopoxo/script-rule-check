import * as vscode from 'vscode';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as childProcess from 'child_process';

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
    private subProcess: childProcess.ChildProcess | null = null;
    private isClosing: boolean = false;

    constructor() {
        this.subProcessPath = path.join(__dirname, '../../../../', 'assets/bin', 'GCBridgeX64.exe');
        this.processName = path.basename(this.subProcessPath);
        this.subProcess = null;
    }

    public async connect(): Promise<boolean> {
        try {
            if (!this.socket) {
                const isProcessRunning = await this.checkProcessExists();
                if (!isProcessRunning) {
                    const processStarted = this.startProcess();
                    if (!processStarted) {
                        return false;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                return await this.connectViaSocket();
            } else {
                return true;
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Cannot connect to ${GC_BRIDGE_NAME}: ${error.message}`);
            return false;
        }
    }

    public async close(): Promise<void> {
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
            this.isClosing = true;
            await this.killExistingProcess();
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.isClosing = false;
        }
    }

    public async tryConnect(): Promise<boolean> {
        if (!this.isConnected) {
            const connected = await this.connect();
            if (!connected) {
                vscode.window.showErrorMessage(`Service closed`);
                return false;
            }
        }
        return true;
    }

    public async doRemoteLuaCall(functionName: string, paramString: string): Promise<boolean> {
        if (!this.socket) {
            this.isConnected = false;
            return false;
        }
        try {
            const wProtocol = 0;
            const wServer = 1;
            const wSubProtocol = e2l_remote_lua_call_def;
            const packet = this.getRemoteLuaCallPacket(wProtocol, wServer, wSubProtocol, functionName, paramString);
            this.socket.write(packet);
            return true;
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error creating packet:${error.message}`);
            return false;
        }
    }

    private async checkProcessExists(): Promise<boolean> {
        return new Promise((resolve) => {
            const command = process.platform === 'win32'
                ? `tasklist /fi "imagename eq ${this.processName}"`
                : `ps -A | grep ${this.processName}`;

            childProcess.exec(command, (error, stdout, stderr) => {
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

            childProcess.exec(command, (error, stdout, stderr) => {
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
            this.subProcess = childProcess.spawn(this.subProcessPath, [], {
                stdio: 'ignore',
                detached: true,
                windowsHide: false
            });
            // const spawnOptions: childProcess.SpawnOptions = {
            //     stdio: 'pipe',
            //     detached: true,
            // };
            // if (process.platform === 'win32') {
            //     // 使用 cmd.exe 来启动程序，确保显示控制台
            //     this.subProcess = childProcess.spawn('cmd.exe', ['/c', 'start', this.subProcessPath], {
            //         ...spawnOptions,
            //         windowsHide: false
            //     });
            // } else {
            //     this.subProcess = childProcess.spawn(this.subProcessPath, [], spawnOptions);
            // }
            this.subProcess.on('error', (error) => {
                vscode.window.showErrorMessage(`${GC_BRIDGE_NAME} error:${error.message}`);
                this.subProcess = null;
            });
            this.subProcess.on('exit', (code) => {
                // console.log(`${GC_BRIDGE_NAME} exited with code ${code}`);
                if (!this.isClosing) {
                    vscode.window.showErrorMessage(`GC is not running, now close service...`);
                }
                this.subProcess = null;
                this.close();
            });
            return true;
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to start ${GC_BRIDGE_NAME}:${error.message}`);
            this.subProcess = null;
            return false;
        }
    }

    private async connectViaSocket(): Promise<boolean> {
        return new Promise((resolve) => {
            this.socket = net.createConnection({ port: SOCKET_PORT, host: SOCKET_HOST }, () => {
                this.isConnected = true;
                console.log(`Connected to ${GC_BRIDGE_NAME} socket`);
                // if (this.reconnectTimer) {
                //     clearTimeout(this.reconnectTimer);
                //     this.reconnectTimer = null;
                // }
                resolve(true);
            });
            this.socket.on('data', (data) => {
            });
            this.socket.on('error', (error) => {
                console.error(`Socket error:${error}`);
                this.isConnected = false;
                resolve(false);
            });

            this.socket.on('close', () => {
                console.log('Socket connection closed');
                this.isConnected = false;
                this.socket = null;
                // if (!this.reconnectTimer) {
                //     this.reconnectTimer = setTimeout(() => {
                //         vscode.window.showWarningMessage(`Attempting to reconnect...`);
                //         this.connectViaSocket();
                //     }, 3000);
                // }
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