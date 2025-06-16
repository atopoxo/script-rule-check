import * as vscode from 'vscode';
import * as path from 'path';
import { ChatManager, ChatSession, ChatMessage, ReferenceItem } from './chat_manager';
import {AIModelMgr} from './core/ai_model/manager/ai_model_mgr';
import {ReferenceOperator} from './reference_operator';

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
    private currentSession: ChatSession | null = null;
    private isInHistoryView = false;
    private isWebviewReady = false;

    constructor(
        private context: vscode.ExtensionContext,
        private chatManager: ChatManager,
        private aiModelMgr: AIModelMgr,
        private referenceOperator: ReferenceOperator
    ) {
        this._extensionUri = context.extensionUri;
        this.currentSession = this.chatManager.getCurrentSession();
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
                case 'showReferenceOptions':
                    await this.showReferenceOptions(data);
                    break;
                case 'selectFiles':
                    await this.selectFiles(data);
                    break;
                case 'selectWorkspace':
                    await this.selectWorkspace();
                    break;
                case 'sendMessage':
                    await this.sendMessage(data.content, data.references);
                    break;
                case 'createSession':
                    await this.createSession();
                    break;
                case 'showHistory':
                    this.showHistory();
                    break;
                case 'loadSession':
                    await this.loadSession(data.sessionId);
                    break;
                case 'deleteSession':
                    await this.deleteSession(data.sessionId);
                    break;
                case 'backToChat':
                    this.backToChat();
                    break;
                case 'addReference':
                    await this.addReference();
                    break;
                case 'removeReference':
                    await this.removeReference(data.refIndex);
                    break;
                case 'updateTitle':
                    await this.updateSessionTitle(data.title);
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
        if (!this.currentSession) {
            this.currentSession = await this.chatManager.createSession();
        }
        const data = {
            isDark: theme === vscode.ColorThemeKind.Dark,
            modelInfos: this.aiModelMgr.getModelInfos(),
            selectedModel: await this.aiModelMgr.getSelectedModel(),
            referenceOptions: await this.referenceOperator.getOptions(undefined),
            currentSession: this.currentSession
        }
        this.updateWebview('initSession', data);
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

    public async showReferenceOptions(data: object | undefined) {
        const result = {
            referenceOptions: await this.referenceOperator.getOptions(data)
        }
        this.updateWebview('showReferenceOptions', result);
    }

    private async selectFiles(data: any) {
        const result = {
            selectFiles: await this.referenceOperator.selectFiles(data.onlyFiles)
        }
        this.updateWebview('selectFiles', result);
    }

    private async selectWorkspace() {
        const result = {
            selectWorkspace: await this.referenceOperator.selectWorkspace()
        }
        this.updateWebview('selectWorkspace', result);
    }

    private async sendMessage(query: string, references: any[]) {
        if (!this.currentSession) {
            return;
        }

        try {
            if (this.view && this.isWebviewReady) {
                const port = this.view.webview;
                const streamGenerator = await this.chatManager.chatStream(query, false, false);
                port.postMessage({
                    type: 'aiStreamStart'
                });
                for await (const chunk of streamGenerator) {
                    port.postMessage({
                        type: 'aiStreamChunk',
                        data: {content: chunk}
                    });
                }
                port.postMessage({
                    type: 'aiStreamEnd'
                });
            }
        } catch (error: any) {
            console.error('流式输出错误:', error);
        }
    }

    async createSession() {
        this.currentSession = await this.chatManager.createSession();
        this.isInHistoryView = false;
        this.updateWebview('createSession', {});
    }

    private async loadSession(sessionId: string) {
        this.currentSession = await this.chatManager.loadSession(sessionId);
        this.isInHistoryView = false;
        this.updateWebview('loadSession', {});
    }

    public async deleteSession(sessionId: string) {
        await this.chatManager.deleteSession(sessionId);
        if (this.currentSession?.id === sessionId) {
            this.currentSession = null;
        }
        this.updateWebview('deleteSession', {});
    }

    public showHistory() {
        this.isInHistoryView = true;
        this.updateWebview('showHistory', {});
    }

    private backToChat() {
        this.isInHistoryView = false;
        this.updateWebview('backToChat', {});
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
        if (this.currentSession) {
            const lastMessage = this.currentSession.messages[this.currentSession.messages.length - 1];
            if (lastMessage && lastMessage.references && refIndex < lastMessage.references.length) {
                lastMessage.references.splice(refIndex, 1);
                await this.chatManager.saveSession(this.currentSession);
                this.updateWebview('removeReference', {});
            }
        }
    }

    private async updateSessionTitle(title: string) {
        if (this.currentSession) {
            await this.chatManager.updateSessionTitle(this.currentSession.id, title);
            this.updateWebview('updateSessionTitle', {});
        }
    }

    public async addSelectionToChat() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            const text = editor.document.getText(selection);
            
            const reference: ReferenceItem = {
                type: 'code',
                path: editor.document.uri.fsPath,
                name: `Selection from ${path.basename(editor.document.fileName)}`,
                content: text,
                range: selection
            };
            
            if (this.view) {
                this.view.webview.postMessage({
                    type: 'addReference',
                    reference
                });
            }
        }
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
            
            const reference: ReferenceItem = {
                type: 'code',
                path: document.uri.fsPath,
                name: `${path.basename(document.fileName)}: ${selected.symbol.name}`,
                content: content,
                range: selected.symbol.range
            };
            
            this.view.webview.postMessage({
                type: 'addReference',
                reference
            });
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
                
                const reference: ReferenceItem = {
                    type: 'file',
                    path: selected.file.fsPath,
                    name: path.basename(selected.file.fsPath),
                    content: text
                };
                
                this.view.webview.postMessage({
                    type: 'addReference',
                    reference
                });
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
            const reference: ReferenceItem = {
                type: 'folder',
                path: selected.folder.fsPath,
                name: path.basename(selected.folder.fsPath)
            };
            
            this.view.webview.postMessage({
                type: 'addReference',
                reference
            });
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
