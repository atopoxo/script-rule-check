import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Session, ContextOption } from './core/ai_model/base/ai_types';
import { ChatManager } from './chat_manager';
import { AIModelMgr } from './core/ai_model/manager/ai_model_mgr';
import { ContextMgr } from './core/context/context_mgr';
import { getEncoding } from './core/function/base_function';

export class ChatViewTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private context: vscode.ExtensionContext
    ) {
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            const item = new vscode.TreeItem('打开聊天面板', vscode.TreeItemCollapsibleState.None);
            item.command = {
                command: 'extension.openChatPanel',
                title: '打开聊天面板'
            };
            item.iconPath = new vscode.ThemeIcon('comment');
            return Promise.resolve([item]);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | undefined;
    private _extensionUri: vscode.Uri;
    private isWebviewReady = false;

    constructor(
        private context: vscode.ExtensionContext,
        private chatManager: ChatManager,
        private aiModelMgr: AIModelMgr,
        private contextMgr: ContextMgr
    ) {
        this._extensionUri = context.extensionUri;
    }

    public resolveWebviewView(
        view: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri,
                vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'static'),
                vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'src', 'assets'),
                vscode.Uri.parse('http://localhost:5173')
            ],
            enableCommandUris: true,
            portMapping: [{ 
                webviewPort: 5173, // Vite 开发服务器默认端口
                extensionHostPort: 9222
            }],
        };
        vscode.window.onDidChangeActiveColorTheme(theme => {
            this.updateTheme(theme.kind);
        });
        view.webview.onDidReceiveMessage(async message => {
            const type = message.type;
            const data = message.data;
            switch (type) {
                case 'ready':
                    this.isWebviewReady = true;
                    await this.initSession(vscode.window.activeColorTheme.kind);
                    break;
                case 'selectModel':
                    await this.selectModel(data.id);
                    break;
                case 'showContextOptions':
                    await this.showContextOptions(data);
                    break;
                case 'selectFiles':
                    await this.selectFiles(data);
                    break;
                case 'selectWorkspace':
                    await this.selectWorkspace(data);
                    break;
                case 'sendMessage':
                    await this.sendMessage(data.sessionId, data.content, data.contextOption, data.contextExpand, data.index);
                    break;
                case 'pauseAIStreamTransfer':
                    this.pauseAIStreamTransfer(data.sessionId);
                    break;
                case 'regenerate':
                    await this.sendMessage(data.sessionId, data.content, data.contextOption, data.contextExpand, data.index);
                    break;
                case 'removeMessage':
                    await this.removeMessage(data.index, data.sessionId);
                    break;
                case 'showSessionsSnapshot':
                    this.showSessionsSnapshot();
                    break;
                case 'selectSession':
                    await this.selectSession(data.sessionId);
                    break;
                case 'addSession':
                    await this.addSession();
                    break;
                case 'removeSession':
                    await this.removeSession(data.sessionId);
                    break;
                case 'removeReference':
                    await this.removeReference(data.refIndex);
                    break;
                case 'expandContext':
                    await this.expandContext(data.index, data.expand);
                    break;
                case 'openContextFile':
                    await this.openContextFile(data.context);
                    break;
                case 'setSessionName':
                    await this.setSessionName(data.sessionId, data.sessionName);
                    break;
            }
        });
        view.onDidDispose(() => {
            this.view = undefined;
        }, null, this.context.subscriptions);
        try {
            view.webview.html = this.getHtmlForWebview(view.webview);
        } catch (error) {
            console.error(error);
        }
    }

    public updateWebview(type: string, data: any) {
        if (this.view && this.isWebviewReady) {
            try {
                this.view.webview.postMessage({
                    type: type,
                    data: data
                });
            } catch (error) {
                console.error("Failed to post message to Webview:", error);
            }
        }
    }

    private async initSession(theme: vscode.ColorThemeKind) {
        let selectedSession = await this.chatManager.getSession('chat');
        if (!selectedSession) {
            selectedSession = await this.chatManager.addSession('chat') as Session;
        }
        selectedSession.isAIStreamTransfer = false;
        const data = {
            isDark: theme === vscode.ColorThemeKind.Dark,
            modelInfos: this.aiModelMgr.getModelInfos(),
            selectedModel: await this.aiModelMgr.getSelectedModel(),
            contextOption: await this.contextMgr.getOptions(undefined),
            selectedSession: selectedSession
        }
        this.updateWebview('initSession', data);
    }

    private async selectSession(sessionId: string) {
        const selectedSession = await this.chatManager.selectSession('chat', sessionId) as Session;
        selectedSession.forceSave = true;
        this.updateWebview('selectSession', {selectedSession: selectedSession});
    }

    private async addSession() {
        const selectedSession = await this.chatManager.addSession('chat') as Session;
        selectedSession.isAIStreamTransfer = false;
        this.updateWebview('addSession', {
            selectedSession: selectedSession
        });
    }

    private async removeSession(sessionId: string) {
        const selectedSession = await this.chatManager.removeSession('chat', sessionId);
        const sessionsSnapshot = await this.chatManager.getAllSessionsSnapshot('chat');
        this.updateWebview('removeSession', {selectedSession: selectedSession, sessionsSnapshot: sessionsSnapshot});
    }

    private async updateTheme(theme: vscode.ColorThemeKind) {
        this.updateWebview('themeUpdate', {isDark: theme === vscode.ColorThemeKind.Dark});
    }

    public async selectModel(id: string) {
        await this.aiModelMgr.setSelectedModel(id, this.chatManager.getUserID());
        const data = {
            selectedModel: await this.aiModelMgr.getSelectedModel()
        }
        this.updateWebview('selectModel', data);
    }

    public async showContextOptions(data: object | undefined) {
        const result = {
            contextOption: await this.contextMgr.getOptions(data)
        }
        this.updateWebview('showContextOptions', result);
    }

    private async selectFiles(data: any) {
        const result = {
            index: data.index,
            contextOption: await this.contextMgr.selectFiles(data.onlyFiles)
        }
        this.updateWebview('updateContext', result);
    }

    private async selectWorkspace(data: any) {
        const result = {
            index: data.index,
            contextOption: await this.contextMgr.selectWorkspace()
        }
        this.updateWebview('updateContext', result);
    }

    private async sendMessage(sessionId?: string, query?: string, contextOption?: any[], contextExpand?: boolean, index?: number) {
        const currentSession = await this.chatManager.getSession('chat', sessionId);
        if (!currentSession) {
            return;
        }
        let streamGenerator: any = undefined;
        try {
            if (this.view && this.isWebviewReady && !currentSession.isAIStreamTransfer) {
                const port = this.view.webview;
                const abortController = new AbortController();
                streamGenerator = await this.chatManager.chatStream(abortController.signal, currentSession, false, false, query, index, contextOption, contextExpand);
                currentSession.isAIStreamTransfer = true;
                port.postMessage({
                    type: 'aiStreamStart',
                    data: {selectedSession: currentSession, messageIndex: index ? index + 1: -1}
                });
                for await (const chunk of streamGenerator) {
                    if (!currentSession.isAIStreamTransfer) {
                        abortController.abort();
                    }
                    if (currentSession.refresh) {
                        port.postMessage({
                            type: 'aiStreamStart',
                            data: {
                                selectedSession: currentSession, 
                                messageIndex: index ? index + 1: currentSession.history.length - 1,
                                reconnect: true
                            }
                        });
                        currentSession.refresh = false;
                    }
                    port.postMessage({
                        type: 'aiStreamChunk',
                        data: {content: chunk}
                    });
                }
                currentSession.isAIStreamTransfer = false;
                port.postMessage({
                    type: 'aiStreamEnd',
                    data: {currentSession: currentSession}
                });
            }
        } catch (error: any) {
            console.error('流式输出错误:', error);
            currentSession.isAIStreamTransfer = false;
        }
    }

    private async pauseAIStreamTransfer(sessionId: string) {
        const currentSession = await this.chatManager.getSession('chat', sessionId);
        if (!currentSession) {
            return;
        }
        currentSession.isAIStreamTransfer = false;
    }

    private async removeMessage(index: number, sessionId?: string) {
        const removeIndexList: number[] = [index, index + 1];
        const data = {
            selectedSession: await this.chatManager.removeMessages('chat', removeIndexList, sessionId)
        };
        this.updateWebview('removeMessage', data);
    }

    public async showSessionsSnapshot() {
        const sessionsSnapshot = await this.chatManager.getAllSessionsSnapshot('chat');
        this.updateWebview('showSessionsSnapshot', {
            sessionsSnapshot: sessionsSnapshot
        });
    }

    private async expandContext(index: number, expand: boolean | undefined) {
        const currentSession = await this.chatManager.setContextExpand("chat", undefined, index, expand);
        if (!currentSession) {
            return;
        }
        this.updateWebview('expandContext', {sessionId: currentSession.sessionId, index: index, expand: expand});
    }

    private async openContextFile(context: ContextOption) {
        try {
            const pathList = context.contextItem?.paths;
            let filePath = '';
            if (pathList) {
                filePath = pathList[0];
            }
            const buffer = fs.readFileSync(filePath);
            let encoding = getEncoding(buffer);
            await vscode.workspace.getConfiguration().update(
                'files.encoding', 
                encoding,
                vscode.ConfigurationTarget.Workspace
            );

            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            const startLine = (context.contextItem?.range?.startLine || 0);
            const endLine = (context.contextItem?.range?.endLine || 0);
            const startPosition = new vscode.Position(startLine, 0);
            const endPosition = new vscode.Position(endLine + 1, 0);
            const selection = new vscode.Range(startPosition, endPosition);
            await vscode.window.showTextDocument(doc, {
                selection: selection
            });
        } catch (error) {
            vscode.window.showErrorMessage(`打开文件失败: ${error}`);
        }
    }

    public async addContext() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            const text = editor.document.getText(selection);
            const subLength = Math.min(text.length, this.contextMgr.getContextNameMaxLength());
            const name = text.substring(0, subLength);
            const startPos = editor.document.offsetAt(selection.start);
            const contextOption: ContextOption[] = [{
                type: 'function',
                id: name,
                name: name,
                describe: name,
                contextItem: {
                    type: 'function',
                    name: name,
                    paths: [editor.document.fileName],
                    content: text,
                    range: {
                        start: startPos,
                        end: startPos + text.length,
                        startLine: selection.start.line,
                        endLine: selection.end.line
                    }
                }
            }]
            this.updateWebview('updateContext', {index: -1, contextOption: contextOption});
        }
    }

    public async checkCode() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            let content = editor.document.getText(selection);
            content = content.replace(/\r\n/g, '\n');
            const fullText = editor.document.getText();
            const startPos = fullText.slice(0, editor.document.offsetAt(selection.start)).replace(/\r\n/g, '\n').length;
            const contextOption = this.contextMgr.getRelevantContext(startPos, content, editor.document.fileName);
            this.updateWebview('updateContext', {
                index: -1,
                contextOption: contextOption,
                query: `请帮我分析一下下面的代码是否存在问题：\n${content}`
            });
        }
    }

    public async addReference() {
        const items = ['代码', '文件', '文件夹'];
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择引用类型'
        });
        
        if (selected === '代码') {
            await this.addCodeReference();
        } else if (selected === '文件') {
            await this.addFileReference();
        } else if (selected === '文件夹') {
            await this.addFolderReference();
        }
    }

    private async removeReference(refIndex: number) {
        // if (this.currentSession) {
        //     const lastMessage = this.currentSession.messages[this.currentSession.messages.length - 1];
        //     if (lastMessage && lastMessage.contextOption && refIndex < lastMessage.contextOption.length) {
        //         lastMessage.contextOption.splice(refIndex, 1);
        //         this.updateWebview('removeReference', {});
        //     }
        // }
    }

    private async setSessionName(sessionId: string, sessionName: string) {
        const session = await this.chatManager.setSessionName('chat', sessionId, sessionName) as Session;
        this.updateWebview('setSessionName', {sessionName: session.name});
    }

    private async addCodeReference() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('没有活动的编辑器');
            return;
        }

        const document = editor.document;
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        if (!symbols || symbols.length === 0) {
            vscode.window.showInformationMessage('此文件中未找到符号');
            return;
        }

        const items = symbols.map(symbol => ({
            label: symbol.name,
            description: symbol.detail,
            detail: `行号: ${symbol.range.start.line + 1}`,
            symbol
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要引用的函数或符号'
        });

        if (selected && this.view) {
            const content = document.getText(selected.symbol.range);
            
            // const reference: ContextItem = {
            //     type: 'code',
            //     path: document.uri.fsPath,
            //     name: `${path.basename(document.fileName)}: ${selected.symbol.name}`,
            //     content: content,
            //     range: selected.symbol.range
            // };
            this.updateWebview('addContext', {contextOption: undefined});
        }
    }

    private async addFileReference() {
        const files = await vscode.workspace.findFiles('**/*');
        const items = files.map(file => ({
            label: path.basename(file.fsPath),
            description: path.dirname(file.fsPath),
            file
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要引用的文件'
        });

        if (selected && this.view) {
            try {
                const content = await vscode.workspace.fs.readFile(selected.file);
                const text = Buffer.from(content).toString('utf8');
                
                // const reference: ContextItem = {
                //     type: 'file',
                //     path: selected.file.fsPath,
                //     name: path.basename(selected.file.fsPath),
                //     content: text
                // };
                this.updateWebview('addContext', {contextOption: undefined});
            } catch (error) {
                vscode.window.showErrorMessage(`读取文件失败: ${error}`);
            }
        }
    }

    private async addFolderReference() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage('没有工作区文件夹');
            return;
        }

        const items = folders.map(folder => ({
            label: folder.name,
            description: folder.uri.fsPath,
            folder: folder.uri
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要引用的文件夹'
        });

        if (selected && this.view) {
            // const reference: ContextItem = {
            //     type: 'folder',
            //     path: selected.folder.fsPath,
            //     name: path.basename(selected.folder.fsPath)
            // };
            this.updateWebview('addContext', {contextOption: undefined});
        }
    }

    private getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'static', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'static', 'main.css')
        );
        
        // 开发模式下使用 Vite 开发服务器
        let isDevelopment = process.env.NODE_ENV === 'development';
        // isDevelopment = false;
        const baseUri = isDevelopment 
            ? 'http://localhost:5173'
            : webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist')).toString();
            
        return `<!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <link rel="icon" type="image/svg+xml" href="./vite.svg" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>大模型聊天窗口</title>
                ${isDevelopment 
                    ? `<script type="module" src="${baseUri}/@vite/client"></script>
                       <script type="module" src="${baseUri}/src/main.ts"></script>`
                    : `<script type="module" crossorigin src="${scriptUri}"></script>
                       <link rel="stylesheet" crossorigin href="${styleUri}">`
                }
            </head>
            <body>
                <div id="app"></div>
            </body>
        </html>`;
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'chatview.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'chatview.css')
        );
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
        );

        return `<!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>大模型聊天窗口</title>
                <link href="${styleUri}" rel="stylesheet">
                <link href="${codiconsUri}" rel="stylesheet">
            </head>
        <body>
            <div id="app">
                <!-- 内容由JavaScript动态生成 -->
            </div>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}
