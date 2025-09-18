import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Session, ContextOption } from './core/ai_model/base/ai_types';
import { ChatManager } from './chat_manager';
import { AIModelMgr } from './core/ai_model/manager/ai_model_mgr';
import { ContextMgr } from './core/context/context_mgr';
import { getEncoding } from './core/function/base_function';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private viewCreatedPromise: Promise<boolean>;
    private viewCreatedResolve!: (value: boolean) => void;
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
        this.viewCreatedPromise = new Promise((resolve) => {
            this.viewCreatedResolve = resolve;
        });
    }

    public async createWebview() {
        if (this.view) {
            return;
        }
        const activeEditor = vscode.window.activeTextEditor;
        await vscode.commands.executeCommand('chatView.focus');
        if (activeEditor) {
            await vscode.window.showTextDocument(activeEditor.document, {
                viewColumn: activeEditor.viewColumn,
                preserveFocus: false
            });
        }
    }

    public async isViewCreated(timeout = 5000): Promise<boolean> {
        if (this.view && this.isWebviewReady) {
            return true;
        }
        if (!this.view) {
            vscode.window.showWarningMessage('switch to chat view');
            await vscode.commands.executeCommand('chatView.focus');
        }
        const viewCreated = await Promise.race([
            this.viewCreatedPromise,
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeout))
        ]);
        return viewCreated;
    }

    public resolveWebviewView(
        view: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        if (!this.view) {
            this.initWebView(view);
        }
    }

    private initWebView(view: vscode.WebviewView) {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri,
                vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'static'),
                vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'assets'),
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
                    if (this.viewCreatedResolve) {
                        this.viewCreatedResolve(true);
                    }
                    break;
                case 'toolsOn':
                    await this.toolsOn();
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
                case 'openExternal':
                    await this.openExternal(data.url);
                    break;
                case 'openSettings':
                    await this.openSettings();
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
            toolsOn: this.chatManager.getToolsOnState(),
            aiCharacter: this.chatManager.getSelectedAICharacter(),
            modelInfos: this.aiModelMgr.getModelInfos(),
            selectedModel: await this.aiModelMgr.getSelectedModel(),
            contextOption: await this.contextMgr.getOptions(undefined),
            selectedSession: selectedSession
        };
        this.updateWebview('initSession', data);
    }

    public selectAICharacter() {
        const data = {
            aiCharacter: this.chatManager.getSelectedAICharacter()
        };
        this.updateWebview('selectAICharacter', data);
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

    private async toolsOn() {
        const state = await this.chatManager.toolsOn();
        const data = {
            toolsOn: state
        };
        this.updateWebview('toolsOn', data);
    }

    public async selectModel(id: string) {
        const selectedModelConfig = await this.aiModelMgr.getModelConfig(id);
        if (!selectedModelConfig) {
            vscode.window.showErrorMessage(`当前选择的模型"${id}"不存在`);
            return;
        }
        if (!selectedModelConfig.apiKey || selectedModelConfig.apiKey.trim() === '') {
            vscode.window.showErrorMessage(`当前选择的模型"${selectedModelConfig.name}"的apiKey未配置`);
            return;
        }
        if (selectedModelConfig.safe === false) {
            const confirm = await vscode.window.showWarningMessage(
                `⚠️ 警告：模型 "${selectedModelConfig.name}" 是外网模型，使用的时候尽量避免敏感信息，否则可能存在安全风险！`,
                { modal: true },
                "继续使用"
            );
            if (confirm !== "继续使用") {
                vscode.window.showInformationMessage(`已取消使用风险模型`);
                return;
            }
        }
        await this.aiModelMgr.setSelectedModel(id, this.chatManager.getUserID(), 'chat');
        const data = {
            selectedModel: await this.aiModelMgr.getSelectedModel()
        };
        this.updateWebview('selectModel', data);
    }

    public async showContextOptions(data: object | undefined) {
        const result = {
            contextOption: await this.contextMgr.getOptions(data)
        };
        this.updateWebview('showContextOptions', result);
    }

    private async selectFiles(data: any) {
        const result = {
            index: data.index,
            contextOption: await this.contextMgr.selectFiles(data.onlyFiles)
        };
        this.updateWebview('updateContext', result);
    }

    private async selectWorkspace(data: any) {
        const result = {
            index: data.index,
            contextOption: await this.contextMgr.selectWorkspace()
        };
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
                const toolsOn = this.chatManager.getToolsOnState();
                streamGenerator = await this.chatManager.chatStream(abortController.signal, currentSession, false, toolsOn, query, index, contextOption, contextExpand);
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
            const fullText = editor.document.getText();
            let content = '';
            let startPos = 0;
            if (selection.isEmpty) {
                content = fullText;
            } else {
                content = editor.document.getText(selection);
                startPos = fullText.slice(0, editor.document.offsetAt(selection.start)).replace(/\r\n/g, '\n').length;
            }
            content = content.replace(/\r\n/g, '\n');
            const subLength = Math.min(content.length, this.contextMgr.getContextNameMaxLength());
            const name = content.substring(0, subLength);
            const contextOption: ContextOption[] = [{
                type: 'function',
                id: name,
                name: name,
                describe: name,
                contextItem: {
                    type: 'function',
                    name: name,
                    paths: [editor.document.fileName],
                    content: content,
                    range: {
                        start: startPos,
                        end: startPos + content.length,
                        startLine: selection.start.line,
                        endLine: selection.end.line
                    }
                }
            }];
            this.updateWebview('updateContext', {index: -1, contextOption: contextOption});
        }
    }

    public async checkCode() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            const fullText = editor.document.getText();
            let content = '';
            let startPos = 0;
            if (selection.isEmpty) {
                content = fullText;
            } else {
                content = editor.document.getText(selection);
                startPos = fullText.slice(0, editor.document.offsetAt(selection.start)).replace(/\r\n/g, '\n').length;
            }
            content = content.replace(/\r\n/g, '\n');
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

    private async openExternal(url: string) {
        await vscode.commands.executeCommand('extension.openExternal', url);
    }

    private async openSettings() {
        // await vscode.commands.executeCommand('workbench.view.extension.script-rule-check');
        await vscode.commands.executeCommand('scriptRuleConfig.focus');
        //vscode.commands.executeCommand('workbench.action.openSettings', 'script-rule-check');
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
            <body style="padding: 0 0px; overflow-x:hidden;">
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
