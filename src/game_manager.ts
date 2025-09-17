import {GCClient} from "./logic/network/gc_client";
import { exec } from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getFileContent } from "./core/function/base_function";

class Mutex {
    private mutex = Promise.resolve();

    lock(): PromiseLike<() => void> {
        let begin: (unlock: () => void) => void = () => {};

        this.mutex = this.mutex.then(() => {
            return new Promise(begin);
        });

        return new Promise(res => {
            begin = res;
        });
    }

    async acquire(): Promise<() => void> {
        return this.lock();
    }
}

export class GameManager {
    private client: GCClient | null = null;
    private taskCount: number = 0;
    private closePromise: Promise<void> | null = null;
    private pendingOperations: Promise<void> = Promise.resolve();
    private readonly mutex = new Mutex();

    constructor() {
    }

    public getGCClient(): GCClient {
        if (!this.client) {
            this.client = new GCClient();
        }
        return this.client;
    }

    public async doGMCommand(uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.closePromise) {
                await this.closePromise;
                this.closePromise = null;
            }
            this.addRef();
        } finally {
            release();
        }

        try {
            await this.executeGMCommand(uriContext, selectedUris);
        } finally {
            await this.releaseRef();
        }
    }

    public async executeGMCommand(uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]): Promise<void> {
        let client = this.getGCClient();
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Script Rule Check Progress",
                cancellable: true
            }, async (progress, token) => {
                progress.report({
                    message: `执行ReloadScript`,
                    increment: 0
                });
                let [rootPath, relativePath] = this.getRelativePath(uriContext, selectedUris);
                let [functionName, params, key, functionManual, moreOperator] = this.getFunctionName(rootPath, relativePath);
                const headerString = "vscode,vscode,";
                const totalTasks = 1 + params.length;
                let completedTasks = 0;
                progress.report({
                    message: `执行ReloadScript (${++completedTasks}/${totalTasks})`,
                    increment: (100 / totalTasks)
                });
                let paramString = headerString + relativePath;
                await client.doRemoteLuaCall("OnScriptReloadByGM", paramString);
                vscode.window.showInformationMessage(`已执行ReloadScript，其参数为${relativePath}`);
                if (moreOperator) {
                    if (params.length === 0) {
                        vscode.window.showInformationMessage(`已执行ReloadScript，但未匹配到${key}值，请手动执行${functionManual}`);
                    } else if (params.length > 5) {
                        vscode.window.showInformationMessage(`已执行ReloadScript，但匹配到的${key}过多，请手动执行${functionManual}`);
                    } else {
                        for (let param of params) {
                            progress.report({
                                message: `执行ReloadScript (${++completedTasks}/${totalTasks})`,
                                increment: (100 / totalTasks)
                            });
                            paramString = headerString + param;
                            await client.doRemoteLuaCall(functionName, paramString);
                            vscode.window.showInformationMessage(`已执行${functionManual}，其参数为${param}`);
                        }
                    }
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`执行ReloadScript失败：${error}`);
        }
    }

    public async findGameProcess(processName: string): Promise<{ host: string; port: number } | null> {
        return new Promise((resolve) => {
            if (process.platform !== 'win32') {
                // 如果不是Windows，我们使用原来的方法（这里省略Unix部分）
                // 注意：Unix部分也需要类似处理吗？根据您的需求来定
                resolve(null);
                return;
            }
            const wmicCommand = `wmic process where "name='${processName}'" get ProcessId /format:csv`;
            exec(wmicCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing WMIC command: ${error}`);
                    resolve(null);
                    return;
                }

                const output = stdout.toString().trim();
                if (!output) {
                    resolve(null);
                    return;
                }

                const lines = output.split('\n').slice(1); // 跳过标题行
                const pids: number[] = [];
                for (const line of lines) {
                    const match = line.match(/,(\d+)$/);
                    if (match) {
                        pids.push(parseInt(match[1], 10));
                    }
                }

                if (pids.length === 0) {
                    resolve(null);
                    return;
                }
                const pid = pids[0];

                // 第二步：使用netstat -ano查找该PID的网络连接
                const netstatCommand = `netstat -ano | findstr ${pid}`;
                exec(netstatCommand, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error executing netstat command: ${error}`);
                        resolve(null);
                        return;
                    }

                    const netstatOutput = stdout.toString().trim();
                    if (!netstatOutput) {
                        resolve(null);
                        return;
                    }

                    const lines = netstatOutput.split('\n');
                    let host = '127.0.0.1';
                    let port = 8000;

                    // 解析netstat输出，找到监听端口
                    for (const line of lines) {
                        // netstat输出格式示例：
                        // TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       1234
                        const match = line.match(/^\s*TCP\s+([\d.]+):(\d+)\s+[\d.]+:\d+\s+LISTENING\s+(\d+)/);
                        if (match) {
                            host = match[1] === '0.0.0.0' ? '127.0.0.1' : match[1];
                            port = parseInt(match[2], 10);
                            const foundPid = parseInt(match[3], 10);
                            if (foundPid === pid) {
                                resolve({ host, port });
                                return;
                            }
                        }
                    }

                    resolve(null);
                });
            });
        });
    }

    private addRef() {
        this.taskCount++;
    }

    private async releaseRef() {
        const release = await this.mutex.acquire();
        let shouldClose = false;
        try {
            if (this.taskCount > 0) {
                this.taskCount--;
            }
            
            shouldClose = this.taskCount === 0 && this.client !== null;
        } finally {
            release();
        }

        if (shouldClose) {
            this.closePromise = this.client!.close().finally(() => {
                // this.client = null;
            });
            await this.closePromise;
        }
    }

    private getRef() {
        return this.taskCount;
    }

    private getRelativePath(uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]): [string, string] {
        let relativePath = '';
        let rootPath = '';
        const targetUri = selectedUris?.[0] || uriContext;
        if (!targetUri) {
            vscode.window.showErrorMessage('No file selected');
            return [rootPath, relativePath];
        }
        const fullPath = targetUri.fsPath;
        const clientIndex = fullPath.indexOf("client\\");
        const serverIndex = fullPath.indexOf("server\\");
        if (clientIndex !== -1) {
            rootPath = fullPath.substring(0, clientIndex);
            relativePath = fullPath.substring(clientIndex + "client\\".length);
        } else if (serverIndex !== -1) {
            rootPath = fullPath.substring(0, serverIndex);
            relativePath = fullPath.substring(serverIndex + "server\\".length);
        } else {
            rootPath = "";
            relativePath = fullPath;
            vscode.window.showWarningMessage('File is not in client or server directory, using full path');
        }
        rootPath = rootPath.replace(/\\/g, '/');
        relativePath = relativePath.replace(/\\/g, '/');
        return [rootPath, relativePath];
    }

    private getFunctionName(rootPath: string, relativePath: string): [string, string[], string, string, boolean] {
        let functionName = '';
        let params: string[] = [];
        let key = '';
        let functionManual = '';
        let moreOperator = true;
        if (relativePath.indexOf('/ai/') !== -1) {
            key = 'AIType';
            params = this.getAITypes(rootPath, relativePath, key);
            functionName = "OnAIReloadByGM";
            functionManual = 'ReloadAI';
        } else if (relativePath.indexOf('scripts/skill/') !== -1) {
            key = 'SkillID';
            params = this.getScriptFiles(rootPath, relativePath, 'skill', key);
            functionName = "OnSkillReloadByGM";
            functionManual = 'ReloadSkillSinceScriptChanged';
        } else if (relativePath.indexOf('scripts/skill_mobile/') !== -1) {
            key = 'SkillID';
            params = this.getScriptFiles(rootPath, relativePath, 'skill_mobile', key);
            functionName = "OnSkillReloadByGM";
            functionManual = 'ReloadSkillSinceScriptChanged';
        } else {
            moreOperator = false;
        }
        return [functionName, params, key, functionManual, moreOperator];
    }

    private getAITypes(rootPath: string, relativePath: string, key: string): string[] {
        let result = [];
        let searchPath = path.join(rootPath, 'client', 'settings', 'AIType');
        let files = fs.readdirSync(searchPath, {recursive: true});
        for (let file of files) {
            if (result.length >= 5) {
                break;
            }
            if (typeof file !== 'string' || !file.includes('sAIType.tab')) {
                continue;
            }
            let filePath = path.join(searchPath, file as string);
            let content = getFileContent(filePath);
            let lines = content.split('\n');
            const headers = lines[0]?.split('\t') || [];
            const scriptFileIndex = headers.findIndex(h => h === 'ScriptFile');
            const aiTypeIndex = headers.findIndex(h => h === key);
            if (scriptFileIndex === -1 || aiTypeIndex === -1) {
                continue;
            }
            for (let i = 1; i < lines.length; i++) {
                const columns = lines[i].split('\t');
                if (columns.length <= Math.max(scriptFileIndex, aiTypeIndex)) {
                    continue;
                }
                let scriptFile = columns[scriptFileIndex].replace(/\\/g, '/');
                if (scriptFile.includes(relativePath)) {
                    result.push(columns[aiTypeIndex]);
                    if (result.length > 5) {
                        break;
                    }
                }
            }
        }
        return result;
    }

    private getScriptFiles(rootPath: string, relativePath: string, tag: string, key: string): string[] {
        let result: string[] = [];
        const prefixToRemove = `scripts/${tag}/`;
        if (relativePath.startsWith(prefixToRemove)) {
            relativePath = relativePath.substring(prefixToRemove.length);
        }
        let searchPath = path.join(rootPath, 'client', 'settings', tag, 'skills.tab');
        let content = getFileContent(searchPath);
        let lines = content.split('\n');
        const headers = lines[0]?.split('\t') || [];
        const scriptFileIndex = headers.findIndex(h => h === 'ScriptFile');
        const skillIDIndex = headers.findIndex(h => h === key);
        if (scriptFileIndex === -1 || skillIDIndex === -1) {
            return result;
        }
        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split('\t');
            if (columns.length <= Math.max(scriptFileIndex, skillIDIndex)) {
                continue;
            }
            let scriptFile = columns[scriptFileIndex].replace(/\\/g, '/');
            if (scriptFile.includes(relativePath)) {
                result.push(columns[skillIDIndex]);
                if (result.length > 5) {
                    break;
                }
            }
        }
        return result;
    }
}