import { singleton } from "tsyringe";
import * as vscode from 'vscode';
import * as path from "path";
import fs from 'fs';
import { getJsonParser } from '../../json/json_parser';
import { ModelInfo } from "../base/ai_types";
import { AIModelBase } from "../base/ai_model_base";
import { Storage } from '../../storage/storage';
import { ContextMgr } from '../../context/context_mgr';

@singleton()
export class AIModelMgr {
    private jsonParser = getJsonParser();
    private models = new Map<string, AIModelBase>();
    private modelconfigs = new Map<string, any>();

    constructor(private config: any, private extensionName: string, private storage: Storage, private contextMgr: ContextMgr) {
        const modelConfigList = this.getAvailableModels();
        this.setModelConfigs(modelConfigList);
    }

    async getSelectedModel(): Promise<ModelInfo | undefined> {
        const config = vscode.workspace.getConfiguration(this.extensionName)
        const selectedModelID = await config.get('selectedModel', '');
        let selectedModel = this.modelconfigs.get(selectedModelID);
        if (!selectedModel) {
            const currentModel = this.modelconfigs.values().next().value;
            await config.update('selectedModel', currentModel.id, vscode.ConfigurationTarget.Global);
            selectedModel = currentModel;
        }
        return selectedModel;
    }

    async setSelectedModel(id: string, userID: string) {
        const config = vscode.workspace.getConfiguration(this.extensionName)
        let selectedModel = this.modelconfigs.get(id);
        if (selectedModel) {
            await config.update('selectedModel', id, vscode.ConfigurationTarget.Global);
            await this.storage.setAIInstanceModelID(userID, 'chat', id);
        }
    }

    getModelInfos(): ModelInfo[] {
        return Array.from(this.modelconfigs.values());
    }

    getAvailableModels():  any[] {
        try {
            const configPath = path.join(__dirname, '../../../', '../../assets/config/model_config.json');
            const rawConfig = fs.readFileSync(configPath, 'utf-8');
            if (rawConfig) {
                const obj = this.jsonParser.parse(rawConfig);
                return obj["models"] as any[];
            } else {
                return [];
            }
        } catch (error) {
            console.error('加载模型配置失败:', error);
            return [];
        }
    }

    saveModelConfig(models: ModelInfo[]) {
        try {
            const configPath = path.join(__dirname, '../../assets/config/model_config.json');
            const configData = {
                models: models
            };
            const jsonString = this.jsonParser.toJsonStr(configData, 4);
            fs.writeFileSync(configPath, jsonString, { encoding: 'utf8' });
            console.log('模型配置已成功更新');
        } catch (error) {
            console.error('更新模型配置失败:', error);
            return [];
        }
    }

    getModelConfig(id: string): any {
        return this.modelconfigs.get(id);
    }

    setModelConfigs(configs: any[]): void {
        for (const config of configs) {
            this.setModelConfig(config.id, config); 
        }
    }

    setModelConfig(id: string, config: any): void {
        this.modelconfigs.set(id, config);
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
        const instance = modelModule.getClass(modelConfig, {storage: this.storage, contextMgr: this.contextMgr});
        if (instance instanceof AIModelBase) {
            this.models.set(id, instance);
        }
    }
}