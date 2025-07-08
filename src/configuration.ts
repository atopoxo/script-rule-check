import * as vscode from 'vscode';
import { ModelInfo, AICharacterInfo } from './core/ai_model/base/ai_types';
import { CheckRule } from "./output_format"
import { getGlobalConfigValue, setGlobalConfigValue } from "./core/function/base_function"

export class ConfigurationProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private allCheckRules: CheckRule[] = [];
    private allModelInfos: ModelInfo[] = [];
    private allAICharacterInfos: AICharacterInfo[] = [];
    private defaultAICharacterId: string = 'normal chat character';

    constructor(private extensionName: string) {
    }
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setCheckRules(checkRules: CheckRule[]) {
        this.allCheckRules = checkRules;
        this._onDidChangeTreeData.fire();
    }

    public async initAICharacterInfos() {
        let aiCharacterInfos = getGlobalConfigValue<any[]>(this.extensionName, 'aiCharacterInfos', []) || [];
        if (aiCharacterInfos.length <= 0) {
            aiCharacterInfos = [{
                id: this.defaultAICharacterId,
                name: '通用聊天角色',
                describe: ''
            }]
            await setGlobalConfigValue(this.extensionName, 'aiCharacterInfos', aiCharacterInfos);
            await setGlobalConfigValue(this.extensionName, 'selectedAICharacter', aiCharacterInfos[0].id);
        }
        this.setAICharacterInfos(aiCharacterInfos);
    }

    public setModelInfos(infos: ModelInfo[]) {
        this.allModelInfos = infos;
        this._onDidChangeTreeData.fire();
    }

    public setAICharacterInfos(infos: AICharacterInfo[]) {
        this.allAICharacterInfos = infos;
        this._onDidChangeTreeData.fire();
    }

    public async getAICharacterInfos(): Promise<AICharacterInfo[]> {
        let aiCharacterInfos = getGlobalConfigValue<any[]>(this.extensionName, 'aiCharacterInfos', []) || [];
        return aiCharacterInfos;
    }

    public async addNewAICharacter(): Promise<void> {
        const name = await vscode.window.showInputBox({
            placeHolder: '输入新角色名称',
            prompt: '请输入AI角色名称'
        });
        if (!name) {
            return;
        }
        const describe = await vscode.window.showInputBox({
            placeHolder: '输入角色描述',
            prompt: '请输入角色描述'
        }) || '';
        const id = `ai_character_${Date.now()}`;
        const newCharacter: AICharacterInfo = {
            id,
            name,
            describe
        };
        const currentCharacters = await this.getAICharacterInfos();
        currentCharacters.push(newCharacter);
        this.setAICharacterInfos(currentCharacters);
        await setGlobalConfigValue(this.extensionName, 'aiCharacterInfos', currentCharacters);
        await setGlobalConfigValue(this.extensionName, 'selectedAICharacter', id);
    }

    public async removeAICharacter(id: string): Promise<void> {
        const currentCharacters = await this.getAICharacterInfos();
        const selectedAICharacterId = getGlobalConfigValue(this.extensionName, 'selectedAICharacter', '');
        const index = currentCharacters.findIndex((item) => item.id === id);
        if (index !== -1) {
            if (currentCharacters[index].id != this.defaultAICharacterId) {
                currentCharacters.splice(index, 1);
            }
        }
        if (id == selectedAICharacterId) {
            await setGlobalConfigValue(this.extensionName, 'selectedAICharacter', this.defaultAICharacterId);
        }
        this.setAICharacterInfos(currentCharacters);
        await setGlobalConfigValue(this.extensionName, 'aiCharacterInfos', currentCharacters);
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
                this.createModelSelectorItem(),
                this.createAICharacterSelectorItem()
            ];
        }
        if (element.contextValue === 'customCheckRuleSelector') {
            return this.createCustomCheckRuleItems();
        } else if (element.contextValue === 'modeSelector') {
            return this.createModeItems();
        } else if (element.contextValue === 'modelSelector') {
            return this.createModelItems();
        } else if (element.contextValue === 'aiCharacterSelector') {
            return this.createAICharacterItems();
        } else if (element.contextValue === 'modelInfo') {
            return this.getModelConfigItems(element);
        } else if (element.contextValue === 'aiCharacterInfo') {
            return this.getAICharacterConfigItems(element);
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

    private createAICharacterSelectorItem(): vscode.TreeItem {
        const selectedAICharacterId = getGlobalConfigValue<string>(this.extensionName, 'selectedAICharacter', '');
        const selectedAICharacter = this.allAICharacterInfos.find(info => info.id === selectedAICharacterId) || {name: ''};
        const item = new vscode.TreeItem(`当前AI角色: ${selectedAICharacter.name}`);
        item.contextValue = 'aiCharacterSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.iconPath = new vscode.ThemeIcon('add');
        item.command = {
            command: 'extension.aiCharacter.add',
            title: '添加新角色'
        };
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

    private createAICharacterItems(): vscode.TreeItem[] {
        return this.allAICharacterInfos.map(item => this.createAICharacterItem(item));
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

    private createAICharacterItem(info: AICharacterInfo): vscode.TreeItem {
        const isSelected = getGlobalConfigValue<string>(this.extensionName, 'selectedAICharacter', '') === info.id;
        const item = new vscode.TreeItem(info.name);
        item.id = info.id;
        item.contextValue = 'aiCharacterInfo';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.iconPath = isSelected ? new vscode.ThemeIcon('check') : undefined;
        item.command = {
            command: 'extension.aiCharacter.selectedChange',
            title: '选择ai角色',
            arguments: [item.id]
        };
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

    private getAICharacterConfigItems(item: vscode.TreeItem): vscode.TreeItem[] {
        const currentItem = this.allAICharacterInfos.find(info => info.id === item.id);
        let describe = "";
        if (currentItem) {
            describe = currentItem.describe;
        }
        const config = {
            "describe": describe
        }

        return Object.entries(config).map(([key, value]) => {
            const configItem = new vscode.TreeItem(`${key}: ${value}`);
            configItem.contextValue = 'aiCharacterlConfig';
            configItem.iconPath = new vscode.ThemeIcon('settings');
            configItem.command = {
                command: 'extension.aiCharacter.editInfo',
                title: '修改ai角色配置',
                arguments: [item.id, {[key]: value}]
            };
            return configItem;
        });
    }
}