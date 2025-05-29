import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { ChatManager, ChatSession, ChatMessage, ReferenceItem } from './chat_manager';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'chatView';

    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;
    private chatManager: ChatManager;
    private currentSession: ChatSession | null = null;
    private isInHistoryView = false;
    private isWebviewReady = false;

    constructor(
        private context: vscode.ExtensionContext,
        private chatManagerInstance: ChatManager
    ) {
        this._extensionUri = context.extensionUri;
        this.chatManager = chatManagerInstance;
        this.currentSession = this.chatManager.getCurrentSession();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'ready':
                    this.isWebviewReady = true;
                    this.updateWebview();
                    break;
                case 'sendMessage':
                    await this.sendMessage(data.content, data.references);
                    break;
                case 'createNewSession':
                    await this.createNewSession();
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
                case 'selectModel':
                    await this.selectModel();
                    break;
                case 'updateTitle':
                    await this.updateSessionTitle(data.title);
                    break;
            }
        });
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }

    private async sendMessage(content: string, references: any[]) {
        if (!this.currentSession) {
            await this.createNewSession();
        }

        if (this.currentSession) {
            // 添加用户消息
            const userMessage: ChatMessage = {
                role: 'user',
                content,
                timestamp: Date.now(),
                references: references.map((ref, index) => ({
                    type: ref.type,
                    path: ref.path,
                    name: ref.name,
                    content: ref.content
                }))
            };

            await this.chatManager.addMessageToSession(userMessage);
            this.updateWebview();

            // 模拟AI响应
            const thinkingMessage: ChatMessage = {
                role: 'assistant',
                content: '思考中...',
                timestamp: Date.now()
            };
            await this.chatManager.addMessageToSession(thinkingMessage);
            this.updateWebview();

            // 延迟后生成响应
            setTimeout(async () => {
                if (this.currentSession) {
                    // 移除"思考中..."消息
                    this.currentSession.messages.pop();
                    
                    const aiResponse: ChatMessage = {
                        role: 'assistant',
                        content: `这是对您消息的响应:\n\n"${content}"\n\n我已经处理了您的请求。`,
                        timestamp: Date.now()
                    };
                    
                    await this.chatManager.addMessageToSession(aiResponse);
                    this.updateWebview();
                }
            }, 2000);
        }
    }

    async createNewSession() {
        this.currentSession = await this.chatManager.createNewSession();
        this.isInHistoryView = false;
        this.updateWebview();
    }

    private async loadSession(sessionId: string) {
        this.currentSession = await this.chatManager.loadSession(sessionId);
        this.isInHistoryView = false;
        this.updateWebview();
    }

    public async deleteSession(sessionId: string) {
        await this.chatManager.deleteSession(sessionId);
        if (this.currentSession?.id === sessionId) {
            this.currentSession = null;
        }
        this.updateWebview();
    }

    public showHistory() {
        this.isInHistoryView = true;
        this.updateWebview();
    }

    private backToChat() {
        this.isInHistoryView = false;
        this.updateWebview();
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
                this.updateWebview();
            }
        }
    }

    public async selectModel() {
        const config = vscode.workspace.getConfiguration('script-rule-chat');
        const models = config.get<any[]>('models', []);
        
        const items = models.map(model => ({
            label: model.name,
            description: model.type,
            id: model.id
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择AI模型'
        });
        
        if (selected && this.currentSession) {
            await this.chatManager.saveSession(this.currentSession);
            this.updateWebview();
        }
    }

    private async updateSessionTitle(title: string) {
        if (this.currentSession) {
            await this.chatManager.updateSessionTitle(this.currentSession.id, title);
            this.updateWebview();
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
            
            if (this._view) {
                this._view.webview.postMessage({
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

        if (selected && this._view) {
            const content = document.getText(selected.symbol.range);
            
            const reference: ReferenceItem = {
                type: 'code',
                path: document.uri.fsPath,
                name: `${path.basename(document.fileName)}: ${selected.symbol.name}`,
                content: content,
                range: selected.symbol.range
            };
            
            this._view.webview.postMessage({
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

        if (selected && this._view) {
            try {
                const content = await vscode.workspace.fs.readFile(selected.file);
                const text = Buffer.from(content).toString('utf8');
                
                const reference: ReferenceItem = {
                    type: 'file',
                    path: selected.file.fsPath,
                    name: path.basename(selected.file.fsPath),
                    content: text
                };
                
                this._view.webview.postMessage({
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

        if (selected && this._view) {
            const reference: ReferenceItem = {
                type: 'folder',
                path: selected.folder.fsPath,
                name: path.basename(selected.folder.fsPath)
            };
            
            this._view.webview.postMessage({
                type: 'addReference',
                reference
            });
        }
    }

    public updateWebview() {
        if (this._view && this.isWebviewReady) {
            try {
                this._view.webview.postMessage({
                    type: 'update',
                    session: this.currentSession,
                    isInHistoryView: this.isInHistoryView,
                    historySessions: this.chatManager.getAllSessions()
                });
            } catch (error) {
                console.error("Failed to post message to Webview:", error);
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'chat_view.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'chat_view.css')
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