import * as vscode from 'vscode';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import { Mutex } from "../../core/function/base_function";

const iconv = require('iconv-lite');

enum LuaValueDef {
    eLuaPackNumber = 0,
    eLuaPackBoolean = 1,
    eLuaPackString = 2,
    eLuaPackNill = 3,
    eLuaPackTable = 4
}

enum B2P_BRIDGE_PROTOCOL {
    b2p_bridge_begin = 0,
    b2p_gc_reload_respond = 0,
    b2p_connect_respond = b2p_gc_reload_respond + 1,  // 1
    b2p_command_respond = b2p_connect_respond + 1,    // 2
    b2p_bridge_end = b2p_command_respond + 1          // 3
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
    private readonly mutex = new Mutex();
    private closePromise: Promise<void> | null = null;
    private processStarted: boolean = false;
    private respondFunc: Map<number, any> = new Map();

    constructor() {
        this.subProcessPath = path.join(__dirname, '../../../../', 'assets/bin', GC_BRIDGE_NAME);
        this.processName = path.basename(this.subProcessPath);
        this.subProcess = null;
        this.respondFunc.set(B2P_BRIDGE_PROTOCOL.b2p_connect_respond, this.onConnectGame);
        this.respondFunc.set(B2P_BRIDGE_PROTOCOL.b2p_command_respond, this.onGameCommand);
    }

    public async tryConnect(): Promise<boolean> {
        const release = await this.mutex.acquire();
        try {
            if (this.closePromise) {
                await this.closePromise;
                this.closePromise = null;
            }
            if (!this.isConnected) {
                const connected = await this.connect();
                if (!connected) {
                    // vscode.window.showErrorMessage(`Service closed`);
                    return false;
                }
            }
            return true;
        } finally {
            release();
        }
        return false;
    }

    public async tryDisconnect() {
        const release = await this.mutex.acquire();
        try {
            this.closePromise = this.close().finally(() => {
                this.isConnected = false;
            });
            await this.closePromise;
        } finally {
            release();
        }
    }

    public async connect(): Promise<boolean> {
        try {
            if (!this.socket) {
                const isProcessRunning = await this.checkProcessExists();
                if (!isProcessRunning) {
                    this.processStarted = await this.startProcess();
                    if (!this.processStarted) {
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
            if (this.processStarted) {
                await this.killExistingProcess();   
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.isClosing = false;
        }
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
            const packetContext = this.getRemoteLuaCallPacket(wProtocol, wServer, wSubProtocol, functionName, paramString);
            const packet = this.getSendPacket(packetContext);
            this.socket.write(packet);
            return true;
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error creating packet:${error.message}`);
            return false;
        }
    }

    public async doConnectGame(): Promise<boolean> {
        if (!this.socket) {
            this.isConnected = false;
            return false;
        }
        try {
            const packetContext = this.getConnectGamePacket('vscode script-rule-check', '127.0.0.1', 10088);
            const packet = this.getSendPacket(packetContext);
            this.socket.write(packet);
            return true;
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error creating packet:${error.message}`);
            return false;
        }
    }

    public async doGameCommand(command: string): Promise<boolean> {
        if (!this.socket) {
            this.isConnected = false;
            return false;
        }
        try {
            const packetContext = this.getGameCommandPacket(command);
            const packet = this.getSendPacket(packetContext);
            this.socket.write(packet);
            return true;
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error creating packet:${error.message}`);
            return false;
        }
    }

    private onConnectGame(data: Buffer): any {
        let result = null;
        if (data.length < 115) { // 22 + 93 = 115
            return result;
        }
        let pluginName = '';
        for (let i = 22; i < 86; i++) {
            const charCode = data.readUInt8(i);
            if (charCode === 0) {
                break;
            }
            pluginName += String.fromCharCode(charCode);
        }
        let ip = '';
        for (let i = 86; i < 110; i++) {
            const charCode = data.readUInt8(i);
            if (charCode === 0) {
                break;
            }
            ip += String.fromCharCode(charCode);
        }
        const port = data.readInt32LE(110);
        const confirm = data.readUInt8(114) !== 0;
        
        result = {
            timestamp: Date.now(),
            host: ip,
            port: port,
            success: confirm
        };
        return result;
    }

    private onGameCommand(data: Buffer): any {
        let result = null;
        if (data.length < 23) { // 22 + 93 = 115
            return result;
        }
        const success = data.readUInt8(22) !== 0;
        
        result = {
            timestamp: Date.now(),
            success: success
        };
        return result;
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

            this.socket.on('data', (data: Buffer) => {
                try {
                    data = this.getReceivePacket(data);
                    // NETWORK_PROTOCOL_HEADER (22字节)
                    if (data.length < 22) {
                        return;
                    }
                    
                    const uCheckSum = data.readUInt32LE(0);
                    const wProtocolID = data.readUInt16LE(4);
                    const dwDataStartIndex = data.readUInt32LE(6);
                    const dwDataEndIndex = data.readUInt32LE(10);
                    const dwDataSize = data.readUInt32LE(14);
                    const nConnIndex = data.readInt32LE(18);
                    
                    const func = this.respondFunc.get(wProtocolID);
                    const result = func(data);
                    return result;
                } catch (error) {
                    return null;
                }
            });
        });
    }

    private getReceivePacket(buffer: Buffer) {
        const packetHeaderSize = 2;
        const packetLength = buffer.length;
        const finalSize = packetLength - packetHeaderSize;
        const finalBuffer = Buffer.alloc(finalSize);
        buffer.copy(finalBuffer, 0, packetHeaderSize, packetLength);
        return finalBuffer;
    }

    private getSendPacket(buffer: Buffer) {
        const packetHeaderSize = 2;
        const packetLength = buffer.length;
        const finalBuffer = Buffer.alloc(packetHeaderSize + packetLength);
        finalBuffer.writeUInt32LE(packetHeaderSize + packetLength, 0);
        buffer.copy(finalBuffer, packetHeaderSize);
        return finalBuffer;
    }

    private getRemoteLuaCallPacket(wProtocol: number, wServer: number, wSubProtocol: number, functionName: string, paramString: string): Buffer {
        const params = this.parseParameters(paramString);
        const paramBuffers: Buffer[] = [];

        for (const param of params) {
            this.encodeParameter(param, paramBuffers);
        }
        const paramData = Buffer.concat(paramBuffers);

        const networkHeaderPackSize = this.getNetworkProtocolHeaderSize();
        const headerPackSize = networkHeaderPackSize + 4;
        const headerSize = headerPackSize + 6;
        const fixedSize = headerSize + 32 + 4;
        const totalSize = fixedSize + paramData.length;
        const dataSize = totalSize - networkHeaderPackSize;
        const buffer = Buffer.alloc(totalSize, 0);
        
        const headerPackOffset = this.fillProtocolHeaderPacket(buffer, 1, 0, dataSize, dataSize, 0);

        buffer.writeUInt16LE(totalSize - headerPackSize, headerPackOffset);
        buffer.writeUInt16LE(wProtocol, headerPackOffset + 4);
        buffer.writeUInt16LE(wServer, headerPackOffset + 6);
        buffer.writeUInt16LE(wSubProtocol, headerPackOffset + 8);

        const funcBuf = Buffer.from(functionName, 'ascii');
        const funcLen = Math.min(funcBuf.length, 31);
        funcBuf.copy(buffer, headerSize, 0, funcLen);

        buffer.writeUInt32LE(paramData.length, headerSize + 32);
        paramData.copy(buffer, fixedSize);

        return buffer;
    }

    private getConnectGamePacket(pluginName: String, ip: String, port: number): Buffer {
        const networkHeaderPackSize = this.getNetworkProtocolHeaderSize();
        let pluginNameOffset = networkHeaderPackSize;
        const ipOffset = pluginNameOffset + 64;
        const portOffset = ipOffset + 24;
        const confirmOffset = portOffset + 4;
        const totalSize = confirmOffset + 1;
        const dataSize = totalSize - networkHeaderPackSize;
        const buffer = Buffer.alloc(totalSize);
        pluginNameOffset = this.fillProtocolHeaderPacket(buffer, 2, 0, dataSize, dataSize, 0);
        let funcBuf = Buffer.from(pluginName, 'ascii');
        let funcLen = Math.min(funcBuf.length, 63);
        funcBuf.copy(buffer, pluginNameOffset, 0, funcLen);
        funcBuf = Buffer.from(ip, 'ascii');
        funcLen = Math.min(funcBuf.length, 23);
        funcBuf.copy(buffer, ipOffset, 0, funcLen);
        buffer.writeUInt16LE(port, portOffset);
        buffer.writeUInt8(1, confirmOffset);
        return buffer;
    }

    private getGameCommandPacket(command: String): Buffer {
        const commandBuffer = Buffer.from(command, 'ascii');
        const commandSize = commandBuffer.length + 1;
        const networkHeaderPackSize = this.getNetworkProtocolHeaderSize();
        let headerOffset = networkHeaderPackSize;
        
        const successOffset = headerOffset + 4;
        const sizeOffset = successOffset + 1;
        const commandOffset = sizeOffset + 4;
        
        const totalSize = commandOffset + commandSize;
        const dataSize = totalSize - networkHeaderPackSize;
        const buffer = Buffer.alloc(totalSize);
        headerOffset = this.fillProtocolHeaderPacket(buffer, 3, 0, dataSize, dataSize, 0);

        buffer.writeUInt32LE(totalSize - successOffset, headerOffset);
        buffer.writeUInt8(0, successOffset);

        buffer.writeUInt32LE(commandSize, sizeOffset);
        commandBuffer.copy(buffer, commandOffset, 0, commandSize);
        
        return buffer;
    }


    private getNetworkProtocolHeaderSize() {
        return 4 + 2 + 4 * 4;
    }

    private fillProtocolHeaderPacket(buffer: Buffer, protocolID: number, startIndex: number, endIndex: number, dataSize: number, connIndex: number): number {
        buffer.writeUInt16LE(this.getNetworkProtocolHeaderSize(), 0);
        buffer.writeUInt16LE(protocolID, 4);
        buffer.writeUInt16LE(startIndex, 6);
        buffer.writeUInt16LE(endIndex, 10);
        buffer.writeUInt16LE(dataSize, 14);
        buffer.writeUInt16LE(connIndex, 18);
        return 22;
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