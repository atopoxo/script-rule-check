#include <winsock2.h>
#include <windows.h>
#include <stdio.h>
#include <signal.h>
#include <stdint.h>
#include <atomic>
#include <vector>

#pragma warning(disable: 4200)

#pragma pack(push, 1)
struct RINGBUFF_STAT {
    unsigned nDataHead;	// 数据起始偏移位置
    unsigned nDataTail;	// 数据结束偏移位置
};

struct ProtocolPack {
    unsigned uSize;
};

struct ProtocolHead : public ProtocolPack {
    unsigned short wProtocol;
    unsigned short wServer;
};

struct SubProtocolHead : public ProtocolHead {
    unsigned short wSubProtocol;
};

struct RemoteLuaCallPacket : public SubProtocolHead {
    char            szFunctionName[32];
    unsigned int    uParamLen;
    BYTE            byParam[0];
};
#pragma pack(pop)

// 共享内存配置
#define SHARED_MEMORY_NAME "1002_r"
#define DATA_OFFSET ((sizeof(RINGBUFF_STAT) + 0xf) & ~0xf)
#define SHARED_MEMORY_SIZE (DATA_OFFSET + (200 * 1024))

// Socket配置
#define SOCKET_PORT 10088
#define SOCKET_BUFFER_SIZE 4096
#define MAX_CLIENTS 10

// 协议定义
#define E2L_REMOTE_LUA_CALL_DEF 202

// 全局变量
HANDLE g_hSharedMemoryHandle = INVALID_HANDLE_VALUE;
LPVOID g_pvSharedMemoryView = NULL;
LPVOID g_pvSharedMemoryDataView = NULL;
std::atomic<bool> g_bRunning = true;
SOCKET g_sServerSocket = INVALID_SOCKET;
std::vector<SOCKET> g_sClientSockets;

int InitializeWinsock() {
    WSADATA wsaData;
    int nResult = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (nResult != 0) {
        fprintf(stderr, "WSAStartup failed: %d\n", nResult);
        return 0;
    }
    return 1;
}

int InitializeSocketServer() {
    g_sServerSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (g_sServerSocket == INVALID_SOCKET) {
        fprintf(stderr, "Socket creation failed: %d\n", WSAGetLastError());
        return 0;
    }

    // 设置Socket选项
    int nOption = 1;
    if (setsockopt(g_sServerSocket, SOL_SOCKET, SO_REUSEADDR, (char*)&nOption, sizeof(nOption)) < 0) {
        fprintf(stderr, "Setsockopt failed: %d\n", WSAGetLastError());
        closesocket(g_sServerSocket);
        return 0;
    }

    // 绑定地址和端口
    struct sockaddr_in sServerAddr;
    sServerAddr.sin_family = AF_INET;
    sServerAddr.sin_addr.s_addr = INADDR_ANY;
    sServerAddr.sin_port = htons(SOCKET_PORT);

    if (bind(g_sServerSocket, (struct sockaddr*)&sServerAddr, sizeof(sServerAddr)) == SOCKET_ERROR) {
        fprintf(stderr, "Bind failed: %d\n", WSAGetLastError());
        closesocket(g_sServerSocket);
        return 0;
    }

    // 开始监听
    if (listen(g_sServerSocket, SOMAXCONN) == SOCKET_ERROR) {
        fprintf(stderr, "Listen failed: %d\n", WSAGetLastError());
        closesocket(g_sServerSocket);
        return 0;
    }

    // 将服务器socket设置为非阻塞模式
    u_long uMode = 1;
    if (ioctlsocket(g_sServerSocket, FIONBIO, &uMode) != 0) {
        fprintf(stderr, "Failed to set non-blocking mode: %d\n", WSAGetLastError());
        closesocket(g_sServerSocket);
        return 0;
    }

    printf("Socket server listening on port %d\n", SOCKET_PORT);
    return 1;
}

int InitializeSharedMemory() {
    g_hSharedMemoryHandle = OpenFileMappingA(
        FILE_MAP_READ | FILE_MAP_WRITE,
        FALSE,
        SHARED_MEMORY_NAME
    );

    if (g_hSharedMemoryHandle == NULL) {
        fprintf(stderr, "Failed to open shared memory: %lu\n", GetLastError());
        return 0;
    }

    g_pvSharedMemoryView = MapViewOfFile(
        g_hSharedMemoryHandle,
        FILE_MAP_READ | FILE_MAP_WRITE,
        0,
        0,
        SHARED_MEMORY_SIZE
    );

    if (g_pvSharedMemoryView == NULL) {
        fprintf(stderr, "Failed to map view of file: %lu\n", GetLastError());
        CloseHandle(g_hSharedMemoryHandle);
        g_hSharedMemoryHandle = INVALID_HANDLE_VALUE;
        return 0;
    }
    g_pvSharedMemoryDataView = ((CHAR*)g_pvSharedMemoryView + DATA_OFFSET);

    printf("Shared memory initialized successfully\n");
    return 1;
}

void CleanupSharedMemory() {
    if (g_pvSharedMemoryView != NULL) {
        g_pvSharedMemoryDataView = NULL;
        UnmapViewOfFile(g_pvSharedMemoryView);
        g_pvSharedMemoryView = NULL;
    }

    if (g_hSharedMemoryHandle != INVALID_HANDLE_VALUE) {
        CloseHandle(g_hSharedMemoryHandle);
        g_hSharedMemoryHandle = INVALID_HANDLE_VALUE;
    }

    printf("Shared memory cleaned up\n");
}

void CleanupSockets() {
    for (SOCKET sClientSocket : g_sClientSockets) {
        if (sClientSocket != INVALID_SOCKET) {
            closesocket(sClientSocket);
        }
    }
    g_sClientSockets.clear();

    if (g_sServerSocket != INVALID_SOCKET) {
        closesocket(g_sServerSocket);
        g_sServerSocket = INVALID_SOCKET;
    }

    WSACleanup();
    printf("Socket resources cleaned up\n");
}

int WriteToSharedMemory(const char* pcszData, size_t uLength) {
    if (g_pvSharedMemoryView == NULL) {
        fprintf(stderr, "Shared memory not initialized\n");
        return 0;
    }
    RINGBUFF_STAT* prsBuffStat = (RINGBUFF_STAT*)g_pvSharedMemoryView;
    size_t uDataSize = SHARED_MEMORY_SIZE - DATA_OFFSET;
    unsigned nDataHead = prsBuffStat->nDataHead;
    unsigned nDataTail = prsBuffStat->nDataTail;
    size_t uFreeSpace;
    if (nDataTail >= nDataHead) {
        uFreeSpace = uDataSize - (nDataTail - nDataHead);
    }
    else {
        uFreeSpace = (size_t)(nDataHead - nDataTail);
    }
    if (uLength > uFreeSpace) {
        fprintf(stderr, "Not enough space in shared memory: required %zu, available %zu\n", uLength, uFreeSpace);
        return 0;
    }
    char* pszDataArea = (char*)g_pvSharedMemoryDataView;
    unsigned uWritePos = nDataTail;
    if (uWritePos + uLength <= uDataSize) {
        memcpy(pszDataArea + uWritePos, pcszData, uLength);
        nDataTail = (int)(uWritePos + uLength);
    } else {
        size_t firstChunk = uDataSize - uWritePos;
        memcpy(pszDataArea + uWritePos, pcszData, firstChunk);
        memcpy(pszDataArea, pcszData + firstChunk, uLength - firstChunk);
        nDataTail = (int)(uLength - firstChunk);
    }
    prsBuffStat->nDataTail = nDataTail;
    FlushViewOfFile(g_pvSharedMemoryView, 0);

    printf("Data written to shared memory: %zu bytes, new tail: %u\n", uLength, nDataTail);
    return 1;
}

// 处理从Socket接收到的数据
void ProcessData(const char* pcszData, size_t uLength) {
    if (uLength < sizeof(RemoteLuaCallPacket)) {
        fprintf(stderr, "Invalid data size: %zu\n", uLength);
        return;
    }

    const RemoteLuaCallPacket* pPacket = (const RemoteLuaCallPacket*)pcszData;
    size_t uExpectedSize = sizeof(RemoteLuaCallPacket) + pPacket->uParamLen;
    if (uLength < uExpectedSize) {
        fprintf(stderr, "Incomplete packet. Expected: %zu, Got: %zu\n", uExpectedSize, uLength);
        return;
    }
    if (WriteToSharedMemory(pcszData, uLength)) {
        printf("Lua call processed: %s, params: %u bytes\n", pPacket->szFunctionName, pPacket->uParamLen);
    }
}

void HandleClientData(SOCKET sClientSocket) {
    char szBuffer[SOCKET_BUFFER_SIZE];
    int nBytesRead = recv(sClientSocket, szBuffer, SOCKET_BUFFER_SIZE, 0);

    if (nBytesRead > 0) {
        ProcessData(szBuffer, nBytesRead);
    }
    else if (nBytesRead == 0) {
        printf("Client disconnected\n");
        closesocket(sClientSocket);
        for (auto it = g_sClientSockets.begin(); it != g_sClientSockets.end(); ++it) {
            if (*it == sClientSocket) {
                g_sClientSockets.erase(it);
                break;
            }
        }
    }
    else {
        int error = WSAGetLastError();
        if (error != WSAEWOULDBLOCK) {
            fprintf(stderr, "Recv failed: %d\n", error);
            closesocket(sClientSocket);
            for (auto it = g_sClientSockets.begin(); it != g_sClientSockets.end(); ++it) {
                if (*it == sClientSocket) {
                    g_sClientSockets.erase(it);
                    break;
                }
            }
        }
    }
}

void AcceptNewClients() {
    struct sockaddr_in sClientAddr;
    int nClientAddrLen = sizeof(sClientAddr);

    SOCKET sClientSocket = accept(g_sServerSocket, (struct sockaddr*)&sClientAddr, &nClientAddrLen);
    if (sClientSocket != INVALID_SOCKET) {
        // 将客户端socket设置为非阻塞模式
        u_long uMode = 1;
        if (ioctlsocket(sClientSocket, FIONBIO, &uMode) == 0) {
            printf("New client connected\n");
            g_sClientSockets.push_back(sClientSocket);
        }
        else {
            fprintf(stderr, "Failed to set non-blocking mode for client: %d\n", WSAGetLastError());
            closesocket(sClientSocket);
        }
    }
    else {
        int nError = WSAGetLastError();
        if (nError != WSAEWOULDBLOCK) {
            fprintf(stderr, "Accept failed: %d\n", nError);
        }
    }
}

void RunServer() {
    fd_set fdsRead;
    struct timeval tTimeout;

    while (g_bRunning) {
        // 设置超时时间
        tTimeout.tv_sec = 1;
        tTimeout.tv_usec = 0;

        // 清空文件描述符集合
        FD_ZERO(&fdsRead);

        // 添加服务器socket到集合
        FD_SET(g_sServerSocket, &fdsRead);

        // 添加所有客户端socket到集合
        for (SOCKET clientSocket : g_sClientSockets) {
            FD_SET(clientSocket, &fdsRead);
        }

        // 等待socket活动
        int activity = select(0, &fdsRead, NULL, NULL, &tTimeout);

        if (activity == SOCKET_ERROR) {
            fprintf(stderr, "Select failed: %d\n", WSAGetLastError());
            continue;
        }

        // 检查服务器socket是否有新连接
        if (FD_ISSET(g_sServerSocket, &fdsRead)) {
            AcceptNewClients();
        }

        // 检查所有客户端socket是否有数据
        for (size_t i = 0; i < g_sClientSockets.size(); ) {
            SOCKET clientSocket = g_sClientSockets[i];

            if (FD_ISSET(clientSocket, &fdsRead)) {
                HandleClientData(clientSocket);

                // 如果客户端已断开，索引不需要增加
                if (std::find(g_sClientSockets.begin(), g_sClientSockets.end(), clientSocket) == g_sClientSockets.end()) {
                    continue;
                }
            }

            i++;
        }

        // 短暂休眠以避免高CPU使用率
        Sleep(10);
    }
}

// 信号处理函数
void SignalHandler(int nSignal) {
    printf("Received signal: %d, shutting down...\n", nSignal);
    g_bRunning = false;
}

int main() {
    printf("Shared Memory Bridge started\n");

    // 设置信号处理
    signal(SIGINT, SignalHandler);
    signal(SIGTERM, SignalHandler);

    // 初始化Winsock
    if (!InitializeWinsock()) {
        fprintf(stderr, "Failed to initialize Winsock\n");
        return 1;
    }

    // 初始化Socket服务器
    if (!InitializeSocketServer()) {
        fprintf(stderr, "Failed to initialize socket server\n");
        WSACleanup();
        return 1;
    }

    // 初始化共享内存
    if (!InitializeSharedMemory()) {
        fprintf(stderr, "Failed to initialize shared memory\n");
        CleanupSockets();
        return 1;
    }

    // 运行服务器
    RunServer();

    // 清理资源
    CleanupSharedMemory();
    CleanupSockets();

    printf("Shared Memory Bridge stopped\n");
    return 0;
}