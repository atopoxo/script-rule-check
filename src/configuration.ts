import * as vscode from 'vscode';

export class ConfigurationProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private config = vscode.workspace.getConfiguration('script-rule-check');
    refresh(): void {
        this.config = vscode.workspace.getConfiguration('script-rule-check');
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            return [
                this.createConfigItem(),
                this.createModeSelectorItem()
            ];
        }
        
        if (element.contextValue === 'modeSelector') {
            return [
                this.createModeItem('tree', 'tree'),
                this.createModeItem('flat', 'flat')
            ];
        }
        
        return [];
    }

    private createConfigItem(): vscode.TreeItem {
        const item = new vscode.TreeItem(`产品库目录: ${this.config.get('productDir')}`);
        item.contextValue = 'configItem';
        item.command = {
            command: 'extension.setProductDir',
            title: '设置产品库目录'
        };
        item.tooltip = '设置产品库目录';
        return item;
    }

    private createModeSelectorItem(): vscode.TreeItem {
        const currentMode = this.config.get<'tree' | 'flat'>('displayMode', 'tree');
        const item = new vscode.TreeItem(`显示模式: ${currentMode}`);
        item.contextValue = 'modeSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.iconPath = new vscode.ThemeIcon(currentMode === 'tree' ? 'list-tree' : 'list-flat');
        return item;
    }

    private createModeItem(mode: string, label: string): vscode.TreeItem {
        const isCurrent = this.config.get('displayMode') === mode;
        const item = new vscode.TreeItem(label);
        item.command = {
            command: 'extension.setDisplayMode',
            title: '',
            arguments: [mode]
        };
        if (isCurrent) {
            item.iconPath = new vscode.ThemeIcon('check');
        }
        return item;
    }
}