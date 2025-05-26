import * as vscode from 'vscode';

export class ModeItem extends vscode.TreeItem {
    constructor(
        public readonly mode: string,
        public readonly parent?: ModeItem
    ) {
        super(mode, vscode.TreeItemCollapsibleState.None);
        this.id = mode;
        this.iconPath = this.getIconPath();
        this.command = {
            command: `extension.setDisplay${mode.charAt(0).toUpperCase() + mode.slice(1)}Mode`,
            title: '切换模式'
        };
    }

    private getIconPath(): string | vscode.ThemeIcon {
        const currentMode = vscode.workspace.getConfiguration('script-rule-check').get('displayMode');
        return currentMode === this.mode 
            ? new vscode.ThemeIcon('check')
            : new vscode.ThemeIcon('circle-outline');
    }

    refresh() {
        this.iconPath = this.getIconPath();
    }
}

export class ModeSelectorProvider implements vscode.TreeDataProvider<ModeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ModeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private currentMode: string;
    constructor(private context: vscode.ExtensionContext) {
        this.currentMode = vscode.workspace.getConfiguration('script-rule-check').get('displayMode') || 'tree';
    }

    setCurrentMode(mode: string) {
        this.currentMode = mode;
    }

    getCurrentMode() {
        return this.currentMode;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: ModeItem): vscode.TreeItem {
        element.refresh();
        return element;
    }

    getChildren(): Thenable<ModeItem[]> {
        return Promise.resolve([
            new ModeItem('tree'),
            new ModeItem('flat'),
            new ModeItem('rule'),
        ]);
    }

    async getCurrentItem(mode: string): Promise<ModeItem|undefined> {
        const items = await this.getChildren();
        return items.find(item => item.mode === mode);
    }

    getParent(): vscode.ProviderResult<ModeItem> {
        return undefined;
    }
}