import * as vscode from 'vscode';
import { ModelInfo, AICharacterInfo, SearchEngineInfo } from './core/ai_model/base/ai_types';
import { CheckRule } from "./output_format";
import { getGlobalConfigValue, setGlobalConfigValue } from "./core/function/base_function";
import { GlobalConfig } from './settings/global_config';

export class ConfigurationProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private allCheckRules: CheckRule[] = [];
    private allModelInfos: ModelInfo[] = [];
    private allAICharacterInfos: AICharacterInfo[] = [];
    private defaultAICharacterId: string = 'normal chat character';
    private allSearchEngineInfos: SearchEngineInfo[] = [];
    private globalConfig: any = new GlobalConfig();
    private config: any;

    constructor(private extensionName: string) {
        this.config = this.globalConfig.getConfig();
    }
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setCheckRules(checkRules: CheckRule[]) {
        this.allCheckRules = checkRules;
        this._onDidChangeTreeData.fire();
    }

    public async init() {
        await this.initAICharacterInfos();
        await this.initSearchEngineInfos();
    }

    public getConfig() {
        return this.config;
    }

    private async initAICharacterInfos() {
        let infos = getGlobalConfigValue<any[]>(this.extensionName, 'aiCharacterInfos', []) || [];
        if (infos.length <= 0) {
            infos = [{
                id: this.defaultAICharacterId,
                name: '通用聊天角色',
                describe: ''
            }];
            await setGlobalConfigValue(this.extensionName, 'aiCharacterInfos', infos);
            await setGlobalConfigValue(this.extensionName, 'selectedAICharacter', infos[0].id);
        }
        this.setAICharacterInfos(infos);
    }

    private async initSearchEngineInfos() {
        let infos = getGlobalConfigValue<any[]>(this.extensionName, 'searchEngineInfos', []) || [];
        if (infos.length <= 0) {
            const defaultId = this.config.tools.searchEngine.default;
            infos = this.config.tools.searchEngine.items.filter((item: any) => item.id === defaultId);
            await setGlobalConfigValue(this.extensionName, 'searchEngineInfos', infos);
            await setGlobalConfigValue(this.extensionName, 'selectedSearchEngine', infos[0].id);
        }
        this.setSearchEngineInfos(infos);
    }

    public setModelInfos(infos: ModelInfo[]) {
        this.allModelInfos = infos;
        this._onDidChangeTreeData.fire();
    }

    public setAICharacterInfos(infos: AICharacterInfo[]) {
        this.allAICharacterInfos = infos;
        this._onDidChangeTreeData.fire();
    }

    public setSearchEngineInfos(infos: SearchEngineInfo[]) {
        this.allSearchEngineInfos = infos;
        this._onDidChangeTreeData.fire();
    }

    public async getAICharacterInfos(): Promise<AICharacterInfo[]> {
        let infos = getGlobalConfigValue<any[]>(this.extensionName, 'aiCharacterInfos', []) || [];
        return infos;
    }

    public async getSearchEngineInfos(): Promise<SearchEngineInfo[]> {
        let infos = getGlobalConfigValue<any[]>(this.extensionName, 'searchEngineInfos', []) || [];
        return infos;
    }

    public async addAICharacter(): Promise<void> {
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
        const newItem: AICharacterInfo = {
            id,
            name,
            describe
        };
        const items = await this.getAICharacterInfos();
        items.push(newItem);
        this.setAICharacterInfos(items);
        await setGlobalConfigValue(this.extensionName, 'aiCharacterInfos', items);
        await setGlobalConfigValue(this.extensionName, 'selectedAICharacter', id);
    }

    public async removeAICharacter(id: string): Promise<void> {
        const infos = await this.getAICharacterInfos();
        const selectedId = getGlobalConfigValue(this.extensionName, 'selectedAICharacter', '');
        const index = infos.findIndex((item) => item.id === id);
        if (index !== -1) {
            if (infos[index].id !== this.defaultAICharacterId) {
                infos.splice(index, 1);
            }
        }
        if (id === selectedId) {
            await setGlobalConfigValue(this.extensionName, 'selectedAICharacter', this.defaultAICharacterId);
        }
        this.setAICharacterInfos(infos);
        await setGlobalConfigValue(this.extensionName, 'aiCharacterInfos', infos);
    }

    public async addSearchEngine(): Promise<void> {
        const name = await vscode.window.showInputBox({
            placeHolder: '输入新搜索引擎名称',
            prompt: '请输入搜索引擎名称'
        });
        if (!name) {
            return;
        }
        const engineId = await vscode.window.showInputBox({
            placeHolder: '输入 engine id',
            prompt: '请输入 engine id'
        }) || '';
        const url = await vscode.window.showInputBox({
            placeHolder: '输入 url',
            prompt: '请输入 url'
        }) || '';
        const apiKey = await vscode.window.showInputBox({
            placeHolder: '输入 api key',
            prompt: '请输入 api key'
        }) || '';

        const id = `search_engine_${Date.now()}`;
        const newItem: SearchEngineInfo = {
            id: id,
            name: name,
            engineId: engineId,
            url: url,
            apiKey: apiKey,
            showConfig: true
        };
        const items = await this.getSearchEngineInfos();
        items.push(newItem);
        this.setSearchEngineInfos(items);
        await setGlobalConfigValue(this.extensionName, 'searchEngineInfos', items);
        await setGlobalConfigValue(this.extensionName, 'selectedSearchEngine', id);
    }

    public async removeSearchEngine(id: string): Promise<void> {
        const infos = await this.getSearchEngineInfos();
        const selectedId = getGlobalConfigValue(this.extensionName, 'selectedSearchEngine', '');
        const index = infos.findIndex((item) => item.id === id);
        const defaultId = this.config.tools.searchEngine.default;
        if (index !== -1) {
            if (infos[index].id !== defaultId) {
                infos.splice(index, 1);
            }
        }
        if (id === selectedId) {
            await setGlobalConfigValue(this.extensionName, 'selectedSearchEngine', defaultId);
        }
        this.setSearchEngineInfos(infos);
        await setGlobalConfigValue(this.extensionName, 'searchEngineInfos', infos);
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            return [
                this.createConfigItem(),
                this.createAIConfigItem(),
                this.createToolSet()
            ];
        }
        if (element.contextValue === 'configItem') {
            return this.createConfigItems();
        } else if (element.contextValue === 'aiConfigItem') {
            return this.createAIConfigItems();
        } else if (element.contextValue === 'modelSelector') {
            return this.createModelItems();
        } else if (element.contextValue === 'toolModelSelector') {
            return this.createToolModelItems();
        } else if (element.contextValue === 'aiCharacterSelector') {
            return this.createAICharacterItems();
        } else if (element.contextValue === 'modelInfo') {
            return this.getModelConfigItems(element);
        } else if (element.contextValue === 'aiCharacterInfo') {
            return this.getAICharacterConfigItems(element);
        } else if (element.contextValue === 'toolSet') {
            return this.createToolSetItems();
        } else if (element.contextValue === 'searchEngineSelector') {
            return this.createSearchEngineItems();
        } else if (element.contextValue === 'scriptCheckSelector') {
            return this.createScriptCheckItems();
        } else if (element.contextValue === 'searchEngineInfo') {
            return this.getSearchEngineConfigItems(element);
        } else if (element.contextValue === 'customCheckRuleSelector') {
            return this.createCustomCheckRuleItems();
        } else if (element.contextValue === 'modeSelector') {
            return this.createModeItems();
        }
        
        return [];
    }

    private createConfigItem(): vscode.TreeItem {
        const item = new vscode.TreeItem('Config');
        item.contextValue = 'configItem';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        return item;
    }

    private createConfigItems(): vscode.TreeItem[] {
        return [
            this.createProductDirConfigItem()
        ];
    }

    private createProductDirConfigItem(): vscode.TreeItem {
        const item = new vscode.TreeItem(`产品库目录: ${getGlobalConfigValue<string>(this.extensionName, 'productDir', '')}`);
        item.contextValue = 'productDirConfigItem';
        item.command = {
            command: 'extension.setProductDir',
            title: '设置产品库目录'
        };
        item.tooltip = '设置产品库目录';
        return item;
    }

    private createAIConfigItem(): vscode.TreeItem {
        const item = new vscode.TreeItem('AI');
        item.contextValue = 'aiConfigItem';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        return item;
    }

    private createAIConfigItems(): vscode.TreeItem[] {
        return [
            this.createModelSelectorItem(),
            this.createToolModelSelectorItem(),
            this.createAICharacterSelectorItem()
        ];
    }

    private createModelSelectorItem(): vscode.TreeItem {
        const id = getGlobalConfigValue<string>(this.extensionName, 'selectedModel', '');
        const models = this.allModelInfos.filter(info => info.id === id);
        const name = models.length > 0 ? models[0].name : '';
        const item = new vscode.TreeItem(`当前'AI Chat'模型: ${name}`);
        item.contextValue = 'modelSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        return item;
    }

    private createToolModelSelectorItem(): vscode.TreeItem {
        const id = getGlobalConfigValue<string>(this.extensionName, 'selectedToolModel', '');
        const models = this.allModelInfos.filter(info => info.id === id);
        const name = models.length > 0 ? models[0].name : '';
        const item = new vscode.TreeItem(`当前'AI Chat'中，决定工具调用的模型: ${name}`);
        item.contextValue = 'toolModelSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        return item;
    }

    private createAICharacterSelectorItem(): vscode.TreeItem {
        const id = getGlobalConfigValue<string>(this.extensionName, 'selectedAICharacter', '');
        const info = this.allAICharacterInfos.find(info => info.id === id) || {name: ''};
        const item = new vscode.TreeItem(`当前AI角色: ${info.name}`);
        item.contextValue = 'aiCharacterSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.iconPath = new vscode.ThemeIcon('add');
        item.command = {
            command: 'extension.aiCharacter.add',
            title: '添加新角色'
        };
        return item;
    }

    private createToolSet(): vscode.TreeItem {
        const item = new vscode.TreeItem('Tools');
        item.contextValue = 'toolSet';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        return item;
    }

    private createToolSetItems(): vscode.TreeItem[] {
        return [
            this.createSearchEngineSelectorItem(),
            this.createScriptCheckSelectorItem()
        ];
    }
    
    private createSearchEngineSelectorItem(): vscode.TreeItem {
        const id = getGlobalConfigValue<string>(this.extensionName, 'selectedSearchEngine', '');
        const info = this.allSearchEngineInfos.find(info => info.id === id) || {name: ''};
        const item = new vscode.TreeItem(`当前搜索引擎: ${info.name}`);
        item.contextValue = 'searchEngineSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.iconPath = new vscode.ThemeIcon('add');
        item.command = {
            command: 'extension.searchEngine.add',
            title: '添加新搜索引擎'
        };
        return item;
    }

    private createScriptCheckSelectorItem(): vscode.TreeItem {
        const item = new vscode.TreeItem('脚本检查工具');
        item.contextValue = 'scriptCheckSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        return item;
    }

    private createScriptCheckItems(): vscode.TreeItem[] {
        return [
            this.createCustomCheckRuleSelectorItem(),
            this.createModeSelectorItem()
        ];
    }

    private createCustomCheckRuleSelectorItem(): vscode.TreeItem {
        const item = new vscode.TreeItem('自定义检查规则');
        item.contextValue = 'customCheckRuleSelector';
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
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

    private createModeSelectorItem(): vscode.TreeItem {
        const currentMode = getGlobalConfigValue<string>(this.extensionName, 'displayMode', 'tree');
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

    private createModelItems(): vscode.TreeItem[] {
        return this.allModelInfos.map(item => this.createModelItem(item));
    }

    private createToolModelItems(): vscode.TreeItem[] {
        return this.allModelInfos.map(item => this.createToolModelItem(item));
    }

    private createAICharacterItems(): vscode.TreeItem[] {
        return this.allAICharacterInfos.map(item => this.createAICharacterItem(item));
    }

    private createSearchEngineItems(): vscode.TreeItem[] {
        return this.allSearchEngineInfos.map(item => this.createSearchEngineItem(item));
    }

    private createModelItem(info: ModelInfo): vscode.TreeItem {
        const isSelected = getGlobalConfigValue<string>(this.extensionName, 'selectedModel', '') === info.id;
        const item = new vscode.TreeItem(info.name);
        item.id = `Model:${info.id}`;
        item.contextValue = info.showConfig ? 'modelInfo': '';
        item.collapsibleState = info.showConfig ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        item.iconPath = isSelected ? new vscode.ThemeIcon('check') : undefined;
        return item;
    }

    private createToolModelItem(info: ModelInfo): vscode.TreeItem {
        const isSelected = getGlobalConfigValue<string>(this.extensionName, 'selectedToolModel', '') === info.id;
        const item = new vscode.TreeItem(info.name);
        item.id = `Tool Model:${info.id}`;
        item.contextValue = '';
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        item.iconPath = isSelected ? new vscode.ThemeIcon('check') : undefined;
        item.command = {
            command: 'extension.toolModel.selectedChange',
            title: '选择工具预判模型',
            arguments: [info.id]
        };
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

    private createSearchEngineItem(info: SearchEngineInfo): vscode.TreeItem {
        const isSelected = getGlobalConfigValue<string>(this.extensionName, 'selectedSearchEngine', '') === info.id;
        const item = new vscode.TreeItem(info.name);
        item.id = info.id;
        item.contextValue = info.showConfig ? 'searchEngineInfo' : '';
        item.collapsibleState = info.showConfig ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        item.iconPath = isSelected ? new vscode.ThemeIcon('check') : undefined;
        item.command = {
            command: 'extension.searchEngine.selectedChange',
            title: '选择搜索引擎',
            arguments: [item.id]
        };
        return item;
    }

    private getModelConfigItems(item: vscode.TreeItem): vscode.TreeItem[] {
        const id = item.id?.split(":")[1];
        const currentModel = this.allModelInfos.find(info => info.id === id);
        let key = "";
        if (currentModel) {
            key = currentModel.apiKey;
        }
        const config = {
            "apiKey": key
        };

        return Object.entries(config).map(([key, value]) => {
            const configItem = new vscode.TreeItem(`${key}: ${value}`);
            configItem.contextValue = 'modelConfig';
            configItem.iconPath = new vscode.ThemeIcon('settings');
            configItem.command = {
                command: 'extension.model.editInfo',
                title: '修改模型配置',
                arguments: [id, {[key]: value}]
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
        };

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

    private getSearchEngineConfigItems(item: vscode.TreeItem): vscode.TreeItem[] {
        const id = item.id?.split(":")[1];
        const currentItem = this.allSearchEngineInfos.find(info => info.id === id);
        let engineId = "";
        let url = "";
        let apiKey = "";
        if (currentItem) {
            engineId = currentItem.engineId;
            url = currentItem.url;
            apiKey = currentItem.apiKey;
        }
        const config = {
            "engineId": engineId,
            "url": url,
            "apiKey": apiKey
        };

        return Object.entries(config).map(([key, value]) => {
            const configItem = new vscode.TreeItem(`${key}: ${value}`);
            configItem.contextValue = 'searchEnginelConfig';
            configItem.iconPath = new vscode.ThemeIcon('settings');
            configItem.command = {
                command: 'extension.searchEngine.editInfo',
                title: '修改搜索引擎配置',
                arguments: [id, {[key]: value}]
            };
            return configItem;
        });
    }
}