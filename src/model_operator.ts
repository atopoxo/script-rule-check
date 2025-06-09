import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import {ModelInfo} from './output_format'
export class ModelOperator {
    constructor(private extensionName: string) {
    }
    getAvailableModels():  ModelInfo[] {
        try {
            const configPath = path.join(__dirname, '../../assets/config/model_config.json');
            const rawConfig = fs.readFileSync(configPath, 'utf-8');
            if (rawConfig) {
                const obj = JSON.parse(rawConfig);
                return obj["models"] as ModelInfo[];
            } else {
                return [];
            }
        } catch (error) {
            console.error('加载模型配置失败:', error);
            return [];
        }
    }

    async getSelectedModel(models: ModelInfo[]): Promise<ModelInfo | undefined> {
        const config = vscode.workspace.getConfiguration(this.extensionName)
        const selectedModelID = await config.get('selectedModel', '');
        let selectedModel = models.find(model => model.id === selectedModelID);
        if (!selectedModel) {
            await config.update('selectedModel', models[0].id, vscode.ConfigurationTarget.Global);
            selectedModel = models[0];
        }
        return selectedModel;
    }

    async setSelectedModel(models: ModelInfo[], id: string) {
        const config = vscode.workspace.getConfiguration(this.extensionName)
        let selectedModel = models.find(model => model.id === id);
        if (selectedModel) {
            await config.update('selectedModel', id, vscode.ConfigurationTarget.Global);
        }
    }

    saveModelConfig(models: ModelInfo[]) {
        try {
            const configPath = path.join(__dirname, '../../assets/config/model_config.json');
            const configData = {
                models: models
            };
            const jsonString = JSON.stringify(configData, null, 4);
            fs.writeFileSync(configPath, jsonString, { encoding: 'utf8' });
            console.log('模型配置已成功更新');
        } catch (error) {
            console.error('更新模型配置失败:', error);
            return [];
        }
    }
}