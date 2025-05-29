import * as vscode from 'vscode';
import { ChatManager, ChatSession } from './chat_manager';
import { ChatViewProvider } from './chat_view';

export class ChatHistoryProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private chatManager: ChatManager;
    private chatViewProvider: ChatViewProvider;
    private isHistoryView: boolean = false;

    constructor(private context: vscode.ExtensionContext, chatViewProvider: ChatViewProvider) {
        this.chatManager = ChatManager.getInstance(context);
        this.chatViewProvider = chatViewProvider;
    }

    public showHistoryView() {
        this.isHistoryView = true;
        this.refresh();
    }

    public showChatView() {
        this.isHistoryView = false;
        this.refresh();
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            if (this.isHistoryView) {
                const backButton = new vscode.TreeItem('Back to Chat', vscode.TreeItemCollapsibleState.None);
                backButton.iconPath = new vscode.ThemeIcon('arrow-left');
                backButton.command = {
                    command: 'chat.showChat',
                    title: 'Back to Chat'
                };

                const title = new vscode.TreeItem('History Sessions', vscode.TreeItemCollapsibleState.None);
                title.iconPath = new vscode.ThemeIcon('history');
                title.contextValue = 'historyTitle';

                return [backButton, title];
            } else {
                return []; // In chat view, history is not shown
            }
        }

        if (element.contextValue === 'historyTitle') {
            const sessions = await this.chatManager.getAllSessions();
            const sessionsByDate = this.groupSessionsByDate(sessions);

            return Object.entries(sessionsByDate).map(([date, sessions]) => {
                const dateItem = new vscode.TreeItem(date, vscode.TreeItemCollapsibleState.Collapsed);
                dateItem.contextValue = 'dateGroup';
                return dateItem;
            });
        }

        if (element.contextValue === 'dateGroup') {
            const date = element.label as string;
            const sessions = await this.chatManager.getAllSessions();
            const sessionsByDate = this.groupSessionsByDate(sessions);
            const dateSessions = sessionsByDate[date] || [];

            return dateSessions.map(session => {
                const sessionItem = new vscode.TreeItem(session.title, vscode.TreeItemCollapsibleState.None);
                sessionItem.contextValue = 'historySession';
                sessionItem.description = new Date(session.lastActive).toLocaleTimeString();
                sessionItem.iconPath = new vscode.ThemeIcon('comment');
                sessionItem.command = {
                    command: 'chat.loadSession',
                    title: 'Load Session',
                    arguments: [session.id]
                };
                return sessionItem;
            });
        }

        return [];
    }

    private groupSessionsByDate(sessions: ChatSession[]): Record<string, ChatSession[]> {
        const groups: Record<string, ChatSession[]> = {};
        
        sessions.forEach(session => {
            const date = new Date(session.lastActive).toLocaleDateString();
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(session);
        });

        return groups;
    }
}