// shared-memory-helper.js
const ffi = require('ffi-napi');
const ref = require('ref-napi');

// 初始化代码
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

class SharedMemoryHelper {
    constructor() {
        this.sharedMemoryHandle = INVALID_HANDLE_VALUE;
        this.sharedMemoryView = null;
    }

    async connect() {
        try {
            this.sharedMemoryHandle = kernel32.OpenFileMappingA(
                FILE_MAP_READ | FILE_MAP_WRITE,
                0,
                "1002_w"
            );

            if (sharedMemoryHandle === 0 || sharedMemoryHandle === INVALID_HANDLE_VALUE) {
                const errorCode = kernel32.GetLastError();
                throw new Error(`Failed to open shared memory: error code: ${errorCode}`);
            }

            this.sharedMemoryView = kernel32.MapViewOfFile(
                sharedMemoryHandle,
                FILE_MAP_READ | FILE_MAP_WRITE,
                0,
                0,
                SHARED_MEMORY_SIZE
            );

            if (this.sharedMemoryView.isNull()) {
                const errorCode = kernel32.GetLastError();
                throw new Error(`Failed to map view of file: error code: ${errorCode}`);
            }

            return true;
        } catch (error) {
            console.error('Cannot connect to shared memory:', error);
            return false;
        }
    }

    disconnect() {
        if (this.sharedMemoryView && !this.sharedMemoryView.isNull()) {
            kernel32.UnmapViewOfFile(this.sharedMemoryView);
            this.sharedMemoryView = null;
        }
        
        if (this.sharedMemoryHandle !== INVALID_HANDLE_VALUE) {
            kernel32.CloseHandle(this.sharedMemoryHandle);
            this.sharedMemoryHandle = INVALID_HANDLE_VALUE;
        }
    }

    getRemoteLuaCallPacket(wProtocol, wServer, wSubProtocol, functionName, paramData) {
        const fixedSize = 6 + 32 + 4;
        const totalSize = fixedSize + paramData.length;
        const buffer = Buffer.alloc(totalSize, 0);

        buffer.writeUInt16LE(wProtocol, 0);
        buffer.writeUInt16LE(wServer, 2);
        buffer.writeUInt16LE(wSubProtocol, 4);

        const funcBuf = Buffer.from(functionName, 'utf8');
        const funcLen = Math.min(funcBuf.length, 31);
        funcBuf.copy(buffer, 6, 0, funcLen);

        buffer.writeUInt32LE(paramData.length, 6 + 32);
        paramData.copy(buffer, fixedSize);

        return buffer;
    }

    async doRemoteLuaCall(functionName, paramString) {
        try {
            const wProtocol = 1;
            const wServer = 1;
            const wSubProtocol = e2l_remote_lua_call_def;
            const paramData = Buffer.from(paramString, 'utf8');
            const packet = getRemoteLuaCallPacket(wProtocol, wServer, wSubProtocol, functionName, paramData);
            
            return writeToSharedMemory(packet);
        } catch (error) {
            console.error('Error creating packet:', error);
            return false;
        }
    }

    writeToSharedMemory(packet) {
        if (!this.sharedMemoryView || this.sharedMemoryView.isNull()) {
            return false;
        }

        try {
            const sharedBuffer = ref.reinterpret(this.sharedMemoryView, SHARED_MEMORY_SIZE, 0);
            packet.copy(sharedBuffer, 0, 0, packet.length);
            
            console.log('Packet written to shared memory successfully');
            return true;
        } catch (error) {
            console.error('Error writing to shared memory:', error);
            return false;
        }
    }
}

const sharedMemoryHelper = new SharedMemoryHelper();

// 处理来自父进程的消息
process.on('message', (message) => {
    if (message.type === 'connect') {
        sharedMemoryHelper.connect().then(success => {
            process.send({ type: 'connected', success });
        });
    } else if (message.type === 'disconnect') {
        sharedMemoryHelper.disconnect();
    } else if (message.type === 'luaCall') {
        sharedMemoryHelper.doRemoteLuaCall(message.functionName, message.paramString).then(success => {
            process.send({ type: 'luaCallResult', success });
        });
    }
});