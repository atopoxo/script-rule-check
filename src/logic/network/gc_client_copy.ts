import * as vscode from 'vscode';
// import * as net from 'net';
import * as ffi from 'ffi-napi';
import * as ref from 'ref-napi';

const e2l_remote_lua_call_def = 202;

const kernel32 = new ffi.Library('kernel32', {
  'CreateFileMappingA': ['int', ['int', 'pointer', 'int', 'int', 'int', 'string']],
  'OpenFileMappingA': ['int', ['int', 'int', 'string']],
  'MapViewOfFile': ['pointer', ['int', 'int', 'int', 'int', 'int']],
  'UnmapViewOfFile': ['int', ['pointer']],
  'CloseHandle': ['int', ['int']],
  'GetLastError': ['int', []]
});

const PAGE_READWRITE = 0x04;
const FILE_MAP_WRITE = 0x0002;
const FILE_MAP_READ = 0x0004;
const INVALID_HANDLE_VALUE = -1;
const SHARED_MEMORY_SIZE = 200 * 1024;

export class GCClient {
    // private client: net.Socket | null = null;
    // private isConnected: boolean = false;

    private sharedMemoryHandle: number = INVALID_HANDLE_VALUE;
    private sharedMemoryView: any = null;
    private isInitialized: boolean = false;

    constructor() {
        this.initRefTypes();
    }

    private initRefTypes() {
        // 这里可以定义需要的结构体类型
    }

     public async connect(): Promise<boolean> {
        try {
            // 使用 OpenFileMapping 打开共享内存
            this.sharedMemoryHandle = kernel32.OpenFileMappingA(
                FILE_MAP_READ | FILE_MAP_WRITE,
                0,
                "1002_w"
            );

            if (this.sharedMemoryHandle === 0 || this.sharedMemoryHandle === INVALID_HANDLE_VALUE) {
                const errorCode = kernel32.GetLastError();
                throw new Error(`Failed to open shared memory: OpenFileMappingA returned ${this.sharedMemoryHandle}, error code: ${errorCode}`);
            }

            // 映射共享内存到当前进程的地址空间
            this.sharedMemoryView = kernel32.MapViewOfFile(
                this.sharedMemoryHandle,
                FILE_MAP_READ | FILE_MAP_WRITE,
                0,
                0,
                SHARED_MEMORY_SIZE
            );

            if (this.sharedMemoryView.isNull()) {
                const errorCode = kernel32.GetLastError();
                throw new Error(`Failed to map view of file: MapViewOfFile returned NULL, error code: ${errorCode}`);
            }

            this.isInitialized = true;
            console.log('Connected to shared memory successfully');
            return true;
        } catch (error: any) {
            console.error('Cannot connect to shared memory:', error);
            vscode.window.showErrorMessage(`Cannot connect to shared memory: ${error.message}`);
            return false;
        }
    }

    public close() {
        if (this.sharedMemoryView && !this.sharedMemoryView.isNull()) {
            kernel32.UnmapViewOfFile(this.sharedMemoryView);
            this.sharedMemoryView = null;
        }
        
        if (this.sharedMemoryHandle !== INVALID_HANDLE_VALUE) {
            kernel32.CloseHandle(this.sharedMemoryHandle);
            this.sharedMemoryHandle = INVALID_HANDLE_VALUE;
        }
        
        this.isInitialized = false;
        console.log('Disconnected from shared memory');
    }

    public async doRemoteLuaCall(functionName: string, paramString: string): Promise<boolean> {
        if (!this.isInitialized) {
            const connected = await this.connect();
            if (!connected) {
                vscode.window.showErrorMessage('Not connected to shared memory');
                return false;
            }
        }

        try {
            const wProtocol = 1;
            const wServer = 1;
            const wSubProtocol = e2l_remote_lua_call_def;
            const paramData = Buffer.from(paramString, 'utf8');
            const packet = this.getRemoteLuaCallPacket(wProtocol, wServer, wSubProtocol, functionName, paramData);
            return await this.writeToSharedMemory(packet);
        } catch (error) {
            console.error('Error creating packet:', error);
            return false;
        }
    }

    // public async connect(host: string, port: number): Promise<boolean> {
    //     return new Promise((resolve) => {
    //         this.client = net.createConnection({ host, port }, () => {
    //             this.isConnected = true;
    //             console.log('Connected to game server');
    //             resolve(true);
    //         });

    //         this.client.on('error', (err) => {
    //             console.error('Connection error:', err);
    //             this.isConnected = false;
    //             resolve(false);
    //         });

    //         this.client.on('close', () => {
    //             this.isConnected = false;
    //             console.log('Connection closed');
    //         });
    //     });
    // }

    // public close() {
    //     if (this.client) {
    //         this.client.end();
    //         this.client = null;
    //         this.isConnected = false;
    //     }
    // }

    // public async doRemoteLuaCall(functionName: string, paramString: string): Promise<boolean> {
    //     if (!this.client || !this.isConnected) {
    //         vscode.window.showErrorMessage('Not connected to game server');
    //         return false;
    //     }
    //     try {
    //         const wProtocol = 1;
    //         const wServer = 1;   // 根据实际服务器设置
    //         const wSubProtocol = e2l_remote_lua_call_def;
    //         const paramData = Buffer.from(paramString, 'utf8');
    //         const packet = this.getRemoteLuaCallPacket(wProtocol, wServer, wSubProtocol, functionName, paramData);
            
    //         return new Promise((resolve) => {
    //             if (this.client) {
    //                 this.client.write(packet, (err) => {
    //                     if (err) {
    //                         console.error('Send error:', err);
    //                         resolve(false);
    //                     } else {
    //                         console.log('Lua call sent successfully');
    //                         resolve(true);
    //                     }
    //                 });
    //             } else {
    //                 resolve(false);
    //             }
    //         });
    //     } catch (error) {
    //         console.error('Error creating packet:', error);
    //         return false;
    //     }
    // }

    private getRemoteLuaCallPacket(wProtocol: number, wServer: number, wSubProtocol:number, functionName: string, paramData: Buffer): Buffer {
        const fixedSize = 6 + 32 + 4; // 6字节头部，32字节函数名，4字节参数长度
        const totalSize = fixedSize + paramData.length;
        const buffer = Buffer.alloc(totalSize, 0); // 初始化为0，确保字符串以0结尾

        // 写入ProtocolHead
        buffer.writeUInt16LE(wProtocol, 0);
        buffer.writeUInt16LE(wServer, 2);

        // 写入wSubProtocol
        buffer.writeUInt16LE(wSubProtocol, 4);

        // 写入函数名
        const funcBuf = Buffer.from(functionName, 'utf8');
        const funcLen = Math.min(funcBuf.length, 31);
        funcBuf.copy(buffer, 6, 0, funcLen);
        // 由于buffer初始化为0，所以不需要显式设置空字符

        // 写入参数长度
        buffer.writeUInt32LE(paramData.length, 6 + 32); // 偏移38

        // 写入参数数据
        paramData.copy(buffer, fixedSize); // 偏移42开始

        return buffer;
    }

    private async writeToSharedMemory(packet: Buffer): Promise<boolean> {
        if (!this.sharedMemoryView || this.sharedMemoryView.isNull()) {
            return false;
        }

        try {
            const sharedBuffer = ref.reinterpret(this.sharedMemoryView, SHARED_MEMORY_SIZE, 0);
            // sharedBuffer.fill(0, 0, SHARED_MEMORY_SIZE);
            // const sharedMemoryBuffer = Buffer.from(this.sharedMemoryView, 0, packet.length);
            packet.copy(sharedBuffer, 0, 0, packet.length);
            
            console.log('Packet written to shared memory successfully on Windows');
            return true;
        } catch (error) {
            console.error('Error writing to shared memory on Windows:', error);
            vscode.window.showErrorMessage('Failed to write to shared memory on Windows');
            return false;
        }
    }

    private readFromSharedMemory(length: number = SHARED_MEMORY_SIZE): Buffer | null {
        if (!this.sharedMemoryView || this.sharedMemoryView.isNull()) {
            return null;
        }

        try {
            const sharedBuffer = ref.reinterpret(this.sharedMemoryView, length, 0);
            const result = Buffer.alloc(length);
            sharedBuffer.copy(result, 0, 0, length);
            return result;
        } catch (error) {
            console.error('Error reading from shared memory:', error);
            return null;
        }
    }
}