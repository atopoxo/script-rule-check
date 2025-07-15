import { singleton } from "tsyringe";
import * as vscode from 'vscode';
import * as path from "path";
import fs from 'fs';
import { getJsonParser } from '../../json/json_parser';
import { ModelInfo } from "../base/ai_types";
import { AIModelBase } from "../base/ai_model_base";
import { Storage } from '../../storage/storage';
import { ContextMgr } from '../../context/context_mgr';
import { setGlobalConfigValue } from '../../function/base_function';

@singleton()
export class AIModelMgr {
    private jsonParser = getJsonParser();
    private models = new Map<string, AIModelBase>();
    private modelConfigs = new Map<string, any>();
    private defaultToolModelId: any;

    constructor(private config: any, private extensionName: string, private storage: Storage, private contextMgr: ContextMgr) {
        const modelConfig = this.getConfigFromFile();
        this.defaultToolModelId = modelConfig['defaultToolModel'];
        this.setModelConfigs(modelConfig["models"]);
    }

    async getSelectedModel(): Promise<ModelInfo | undefined> {
        const config = vscode.workspace.getConfiguration(this.extensionName)
        const id = await config.get('selectedModel', '');
        let selectedModel = this.modelConfigs.get(id);
        if (!selectedModel) {
            const currentModel = this.modelConfigs.values().next().value;
            await config.update('selectedModel', currentModel.id, vscode.ConfigurationTarget.Global);
            selectedModel = currentModel;
        }
        return selectedModel;
    }

    public async setSelectedModels(defaultModelId: string, defaultToolModelId: string, userId: string, instanceName: string) {
        await this.setSelectedModel(defaultModelId, userId, instanceName);
        await this.setSelectedToolModel(defaultToolModelId, userId, instanceName);
    }

    public async setSelectedModel(id: string, userID: string, instanceName: string) {
        let selectedModel = this.modelConfigs.get(id);
        if (selectedModel) {
            await setGlobalConfigValue(this.extensionName, 'selectedModel', id);
            await this.storage.setAIInstanceModelId(userID, instanceName, id);
        }
    }

    public async setSelectedToolModel(id: string, userID: string, instanceName: string) {
        let selectedModel = this.modelConfigs.get(id);
        if (selectedModel) {
            await setGlobalConfigValue(this.extensionName, 'selectedToolModel', id);
            await this.storage.setAIInstanceToolModelId(userID, instanceName, id);
        }
    }

    public async getSelectedToolModel() {
        const config = vscode.workspace.getConfiguration(this.extensionName)
        const id = await config.get('selectedToolModel', '');
        let selectedModel = this.modelConfigs.get(id);
        if (!selectedModel) {
            const currentModel = this.modelConfigs.get(this.defaultToolModelId);
            await config.update('selectedToolModel', currentModel.id, vscode.ConfigurationTarget.Global);
            selectedModel = currentModel;
        }
        return selectedModel;
    }

    getModelInfos(): ModelInfo[] {
        return Array.from(this.modelConfigs.values());
    }

    getConfigFromFile(): any {
        try {
            const configPath = path.join(__dirname, '../../../', '../../assets/config/model_config.json');
            const rawConfig = fs.readFileSync(configPath, 'utf-8');
            if (rawConfig) {
                const obj = this.jsonParser.parse(rawConfig);
                return obj;
            } else {
                return {};
            }
        } catch (error) {
            console.error('加载模型配置失败:', error);
            return {};
        }
    }

    saveModelConfig(key: string, value: any) {
        try {
            const configData = this.getConfigFromFile();
            configData[key] = value;
            const configPath = path.join(__dirname, '../../../', '../../assets/config/model_config.json');
            const jsonString = this.jsonParser.toJsonStr(configData, 4);
            fs.writeFileSync(configPath, jsonString, { encoding: 'utf8' });
            const modelConfig = this.getConfigFromFile();
            this.setModelConfigs(modelConfig["models"]);
            console.log('模型配置已成功更新');
        } catch (error) {
            console.error('更新模型配置失败:', error);
            return;
        }
    }

    getModelConfig(id: string): any {
        return this.modelConfigs.get(id);
    }

    setModelConfigs(configs: any[]): void {
        for (const config of configs) {
            this.setModelConfig(config.id, config); 
        }
    }

    setModelConfig(id: string, config: any): void {
        this.modelConfigs.set(id, config);
    }

    public async chatStream(signal: AbortSignal, modelID: string, inputData: any): Promise<any> {
        const modelConfig = this.getModelConfig(modelID);
        const model = await this.getModel(modelConfig);
        return model.chatStream(signal, inputData);
    }

    async getModel(modelConfig: any): Promise<AIModelBase> {
        const id = modelConfig.id;
        if (!this.models.has(id)) {
            await this.createModel(modelConfig, id);
        }
        const model = this.models.get(id);
        if (!model) {
            throw new Error(`Model ${id} not found`);
        }
        return model;
    }

    private async createModel(modelConfig: any, id: string) {
        const platform = modelConfig.platform;
        const name = modelConfig.codeName;
        const modelDir = path.join(path.dirname(__dirname), `${platform}/models`);
        const modelPath = path.join(modelDir, `${name}/modeling`);
        const modelModule = await require(modelPath);
        this.config.model = modelConfig;
        const instance = modelModule.getClass(this.config, {storage: this.storage, contextMgr: this.contextMgr});
        if (instance instanceof AIModelBase) {
            this.models.set(id, instance);
        }
    }
}