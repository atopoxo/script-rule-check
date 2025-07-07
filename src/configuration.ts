import * as vscode from 'vscode';
import { ModelInfo } from './core/ai_model/base/ai_types';
import { CheckRule } from "./output_format"
import { getGlobalConfigValue } from "./core/function/base_function"

export class ConfigurationProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private allCheckRules: CheckRule[] = [];
    private allModelInfos: ModelInfo[] = [];

    constructor(private extensionName: string) {
    }
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setCheckRules(checkRules: CheckRule[]) {
        this.allCheckRules = checkRules;
        this._onDidChangeTreeData.fire();
    }

    setModelInfos(modelInfos: ModelInfo[]) {
        this.allModelInfos = modelInfos;
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
                this.createModelSelectorItem()
            ];
        }
        if (element.contextValue === 'customCheckRuleSelector') {
            return this.createCustomCheckRuleItems();
        } else if (element.contextValue === 'modeSelector') {
            return this.createModeItems();
        } else if (element.contextValue === 'modelSelector') {
            return this.createModelItems();
        } else if (element.contextValue === 'modelInfo') {
            return this.getModelConfigItems(element);
        }
        
        return [];
    }

    private createConfigItem(): vscode.TreeItem {
        const item = new vscode.TreeItem(`产品库目录: ${getGlobalConfigValue<string>(this.extensionName, 'productDir', '')}`);
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
        const currentMode = getGlobalConfigValue<string>(this.extensionName, 'displayMode', 'tree');
        const item = new vscode.TreeItem(`显示模式: ${currentMode}`);
        item.contextValue = 'modeSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.iconPath = new vscode.ThemeIcon(currentMode === 'tree' ? 'list-tree' : 'list-flat');
        return item;
    }

    private createModelSelectorItem(): vscode.TreeItem {
        const selectedModel = getGlobalConfigValue<string>(this.extensionName, 'selectedModel', '');
        const item = new vscode.TreeItem(`当前模型: ${selectedModel}`);
        item.contextValue = 'modelSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
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
        const isCurrent = getGlobalConfigValue<string>(this.extensionName, 'displayMode', 'flat') === mode;
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
        const isSelected = getGlobalConfigValue<string[]>(this.extensionName, 'customCheckRules', []).includes(rule.id);
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

    private createModelItems(): vscode.TreeItem[] {
        return this.allModelInfos.map(item => this.createModelItem(item));
    }

    private createModelItem(info: ModelInfo): vscode.TreeItem {
        const isSelected = getGlobalConfigValue<string>(this.extensionName, 'selectedModel', '') === info.id;
        const item = new vscode.TreeItem(info.name);
        item.id = info.id;
        item.contextValue = info.showConfig ? 'modelInfo': '';
        item.collapsibleState = info.showConfig ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        // item.command = {
        //     command: 'extension.toggleModelInfo',
        //     title: info.name,
        //     arguments: [info.id]
        // };
        item.iconPath = isSelected ? new vscode.ThemeIcon('check') : undefined;
        return item;
    }

    private getModelConfigItems(modelInfo: vscode.TreeItem): vscode.TreeItem[] {
        const currentModel = this.allModelInfos.find(info => info.id === modelInfo.id);
        let key = "";
        if (currentModel) {
            key = currentModel.apiKey;
        }
        const config = {
            "apiKey": key
        }

        return Object.entries(config).map(([key, value]) => {
            const configItem = new vscode.TreeItem(`${key}: ${value}`);
            configItem.contextValue = 'modelConfig';
            configItem.iconPath = new vscode.ThemeIcon('settings');
            configItem.command = {
                command: 'extension.model.editInfo',
                title: '修改模型配置',
                arguments: [modelInfo.id, {[key]: value}]
            };
            return configItem;
        });
    }
}