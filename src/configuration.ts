import * as vscode from 'vscode';

export class ConfigurationProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(): Promise<vscode.TreeItem[]> {
        const config = vscode.workspace.getConfiguration('script-rule-check');
        return [
            this.createConfigItem('productDir', '产品库目录', config.get('productDir')),
            this.createModeSelectorItem(config.get('displayMode'))
        ];
    }

    private createConfigItem(key: string, label: string, value: any): vscode.TreeItem {
        const item = new vscode.TreeItem(`${label}: ${value}`);
        item.contextValue = 'configItem';
        
        if (key === 'productDir') {
            item.command = {
                command: 'extension.setProductDir',
                title: '设置产品库目录'
            };
            item.tooltip = '设置产品库目录';
        }
        
        return item;
    }

    private createModeSelectorItem(currentMode?: string): vscode.TreeItem {
        currentMode = currentMode || 'tree';
        const item = new vscode.TreeItem(`显示模式: ${currentMode}`);
        item.contextValue = 'modeSelector';
        item.iconPath = new vscode.ThemeIcon('list-selection');
        
        item.command = {
            command: 'extension.chooseDisplayMode',
            title: '选择显示模式'
        };
        
        item.tooltip = `当前模式：${currentMode}（点击选择显示模式）`;
        return item;
    }
}