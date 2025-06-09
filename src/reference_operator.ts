import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import {ReferenceOption} from './output_format'
export class ReferenceOperator {
    constructor(private extensionName: string) {
    }

    getOptions(): ReferenceOption[] {
        let options = this.getOptionsFromFile();
        options.forEach(option => {
            if (option.type == 'code') {
                option.children = this.getCodeReferenceOptions()
            }
        })
        return options;
    }
    getOptionsFromFile():  ReferenceOption[] {
        try {
            const configPath = path.join(__dirname, '../../assets/config/reference_config.json');
            const rawConfig = fs.readFileSync(configPath, 'utf-8');
            if (rawConfig) {
                const obj = JSON.parse(rawConfig);
                return obj["options"] as ReferenceOption[];
            } else {
                return [];
            }
        } catch (error) {
            console.error('加载引用配置失败:', error);
            return [];
        }
    }

    getCodeReferenceOptions(): ReferenceOption[] {
        return [
            {
                type: 'function',
                id: 'showReference',
                name: 'showReference',
                describe: '显示引用',
                reference: { type: 'function', name: 'showReference'}
            },
            {
                type: 'function',
                id: 'selectedModel',
                name: 'selectedModel',
                describe: '选择模型',
                reference: { type: 'function', name: 'selectedModel'}
            },
            {
                type: 'function',
                id: 'acquireHistory',
                name: 'acquireHistory',
                describe: '获取历史',
                reference: { type: 'function', name: 'acquireHistory'}
            }
        ]
    }
}