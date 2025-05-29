import * as vscode from 'vscode';

export class ModelSelector {
    static async selectModel(context: vscode.ExtensionContext): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration('script-rule-chat');
        const models = config.get<any[]>('models', []);
        
        const items = models.map(model => ({
            label: model.name,
            description: model.type,
            detail: model.description || ''
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select an AI model'
        });

        if (selected) {
            context.globalState.update('selectedModel', selected.label);
            return selected.label;
        }
    }
}