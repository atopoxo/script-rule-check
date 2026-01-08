import * as vscode from 'vscode';
import { ModelInfo } from '../core/ai_model/base/ai_types';
import { AIModelMgr } from '../core/ai_model/manager/ai_model_mgr';
import { ConfigurationProvider } from '@/configuration';

export class ModelConfigPanel {
    private aiModelMgr: AIModelMgr | undefined;
    private configurationProvider: ConfigurationProvider | undefined;

    constructor(aiModelMgr: AIModelMgr | undefined, configurationProvider: ConfigurationProvider | undefined) {
        this.aiModelMgr = aiModelMgr;
        this.configurationProvider = configurationProvider;
    }

    public addModel(): void {
        const panel = vscode.window.createWebviewPanel(
            'addAiModel',
            '添加 AI 模型',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getAddModelWebviewContent(panel.webview);

        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'submit') {
                const { name, url, apiKey, modelName } = message.data;

                if (!name || !url || !apiKey || !modelName) {
                    vscode.window.showErrorMessage('所有字段都必须填写！');
                    return;
                }

                const newItem: ModelInfo = {
                    url: url,
                    id: `online/${Date.now()}`,
                    platform: 'online',
                    codeName: 'deepseek',
                    modelName: modelName,
                    temperature: 1,
                    maxTokens: 8192,
                    name: name,
                    type: '外网-快速响应',
                    showConfig: true,
                    safe: false,
                    apiKey: apiKey,
                    canModify: true
                };

                await this.configurationProvider?.updateModelInfos(newItem);
                vscode.window.showInformationMessage(`模型 "${name}" 已添加！`);
                panel.dispose();
            } else if (message.command === 'cancel') {
                panel.dispose();
            }
        });
    }

    private getAddModelWebviewContent(webview: vscode.Webview): string {
        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>添加模型</title>
    <style>
        body { padding: 20px; font-family: system-ui, -apple-system, sans-serif; }
        label { display: block; margin-top: 16px; font-weight: bold; }
        input { width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
        button { margin-top: 20px; padding: 8px 16px; margin-right: 10px; }
    </style>
</head>
<body>
    <label>自定义名称</label>
    <input id="name" type="text" placeholder="例如：DeepSeek-Coder">

    <label>API URL</label>
    <input id="url" type="text" placeholder="例如：https://api.deepseek.com/v1/chat/completions">

    <label>API Key</label>
    <input id="apiKey" type="password" placeholder="输入你的 API Key">

    <label>模型名</label>
    <input id="modelName" type="text" placeholder="输入模型名">

    <button onclick="submitForm()">添加模型</button>
    <button onclick="cancelForm()">取消</button>

    <script>
        const vscode = acquireVsCodeApi();

        function submitForm() {
            const name = document.getElementById('name').value.trim();
            const url = document.getElementById('url').value.trim();
            const apiKey = document.getElementById('apiKey').value.trim();
            const modelName = document.getElementById('modelName').value.trim();
            vscode.postMessage({
                command: 'submit',
                data: { name, url, apiKey, modelName }
            });
        }

        function cancelForm() {
            vscode.postMessage({ command: 'cancel' });
        }
    </script>
</body>
</html>`;
    }
}


