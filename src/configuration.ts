import * as vscode from 'vscode';
import {CheckRule} from './output_format'

export class ConfigurationProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private config = vscode.workspace.getConfiguration('script-rule-check');
    private allCheckRules: CheckRule[] = [];

    constructor() {
    }
    refresh(): void {
        this.config = vscode.workspace.getConfiguration('script-rule-check');
        this._onDidChangeTreeData.fire();
    }

    setCheckRules(checkRules: CheckRule[]) {
        this.allCheckRules = checkRules;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            return [
                this.createConfigItem(),
                this.createCustomCheckRuleSelectorItem(),
                this.createModeSelectorItem(),
            ];
        }
        if (element.contextValue === 'customCheckRuleSelector') {
            return this.createCustomCheckRuleItems();
        } else if (element.contextValue === 'modeSelector') {
            return this.createModeItems();
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

    private createCustomCheckRuleSelectorItem(): vscode.TreeItem {
        const item = new vscode.TreeItem('自定义检查规则');
        item.contextValue = 'customCheckRuleSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        return item;
    }

    private createModeSelectorItem(): vscode.TreeItem {
        const currentMode = this.config.get('displayMode', 'tree');
        const item = new vscode.TreeItem(`显示模式: ${currentMode}`);
        item.contextValue = 'modeSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.iconPath = new vscode.ThemeIcon(currentMode === 'tree' ? 'list-tree' : 'list-flat');
        return item;
    }

    private createModeItems(): vscode.TreeItem[] {
        return [
            this.createModeItem('tree', 'tree'),
            this.createModeItem('flat', 'flat'),
            this.createModeItem('rule', 'rule')
        ];
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

    private createCustomCheckRuleItems(): vscode.TreeItem[] {
        return this.allCheckRules.map(rule => this.createCustomCheckRuleItem(rule));
    }
    private createCustomCheckRuleItem(rule: CheckRule): vscode.TreeItem {
        const isSelected = this.config.get<string[]>('customCheckRules', []).includes(rule.id);
        const item = new vscode.TreeItem(rule.taskName);
        item.id = rule.id;
        item.contextValue = 'customCheckRule';
        item.command = {
            command: 'extension.toggleCustomCheckRules',
            title: rule.taskName,
            arguments: [rule.id]
        };
        item.iconPath = isSelected ? new vscode.ThemeIcon('check') : undefined;
        return item;
    }
}