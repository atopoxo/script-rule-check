import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const iconv = require('iconv-lite');
import {RuleOperator, RuleResultProvider} from './rule_check';
import {ConfigurationProvider} from './configuration';

let ruleOperator: RuleOperator;
let ruleResultProvider: RuleResultProvider;
let customConfig: vscode.WorkspaceConfiguration;
let treeView: vscode.TreeView<vscode.TreeItem>;
export function activate(context: vscode.ExtensionContext) {
	console.log("script-rule-check actived!");
    customConfig = vscode.workspace.getConfiguration('script-rule-check');
    ruleOperator = new RuleOperator();
	ruleResultProvider = new RuleResultProvider();
	treeView = vscode.window.createTreeView('ruleCheckResults', {
		treeDataProvider: ruleResultProvider
	});
	context.subscriptions.push(treeView);
    const updateDisplayMode = () => {
        const displayMode = customConfig.get<string>('displayMode', 'tree');
        vscode.commands.executeCommand('setContext', 'script-rule-check.displayMode', displayMode);
        return displayMode;
    };
    let currentDisplayMode = updateDisplayMode();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('script-rule-check')) {
                customConfig = vscode.workspace.getConfiguration('script-rule-check');
                currentDisplayMode = updateDisplayMode();
                ruleResultProvider.refresh();
            }
        })
    );
    
    const configurationProvider = new ConfigurationProvider();
    vscode.window.registerTreeDataProvider('scriptRuleConfig', configurationProvider);
	context.subscriptions.push(
		vscode.commands.registerCommand('extension.checkLuaRules', async (uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
            const productDir = customConfig.get<string>('productDir', 'z:/trunk');
            if (!fs.existsSync(productDir)) {
                vscode.window.showErrorMessage(`配置路径不存在: ${productDir}`);
                return;
            }  
            const targets = getParams(uriContext, selectedUris);
            const luaParams = "io.stdout:setvbuf('no')"
            const toolDir = path.join(productDir, "tools/CheckScripts/CheckScripts");
            const luaExe = path.join(toolDir, "lua/5.1/lua.exe");
            const ruleDir = path.join(toolDir, "Case");
            const cwd = ruleDir;
            const logDir = path.join(toolDir, "Log");
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            const ruleFiles = ruleOperator.getRuleFiles(toolDir, ruleDir);
            
            ruleResultProvider.clear();
            ruleOperator.clearResults();
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Script Rule Check Progress",
                cancellable: true
            }, async (progress, token) => {
                const totalTasks = targets.length * ruleFiles.length;
                let completedTasks = 0;
                for (const target of targets) {
                    for (const ruleFile of ruleFiles) {
                        if (token.isCancellationRequested) {
                            vscode.window.showInformationMessage("用户取消操作");
                            return;
                        }
                        progress.report({
                            message: `目标: ${path.basename(target.path)} - 规则: ${path.basename(ruleFile)} (${++completedTasks}/${totalTasks})`,
                            increment: (100 / totalTasks)
                        });
                        await ruleOperator.processRuleFile(ruleFile, logDir, luaExe, luaParams, target.path, productDir, cwd);
                    }
                }
                let rootNode = ruleOperator.getVirtualRoot(false, targets);
                ruleResultProvider.update(rootNode);
                const issueCount = ruleOperator.getIssueCount();
                treeView.description = `${issueCount} issues`;
            });
		}),
        vscode.commands.registerCommand('extension.chooseDisplayMode', async () => {
            const modeOptions = [
                { label: '$(list-tree) 树状模式', value: 'tree' },
                { label: '$(list-flat) 平铺模式', value: 'flat' }
            ];
            const selected = await vscode.window.showQuickPick(modeOptions, {
                placeHolder: '选择显示模式'
            });
            if (selected) {
                await customConfig.update('displayMode', selected.value, vscode.ConfigurationTarget.Global);
            }
        }),
        vscode.commands.registerCommand('extension.setProductDir', async () => {
            const currentDir = customConfig.get<string>('productDir', 'z:/trunk');
            const newDir = await vscode.window.showInputBox({
                value: currentDir,
                prompt: 'Enter the product directory path'
            });
            if (newDir !== undefined) {
                await customConfig.update('productDir', newDir, vscode.ConfigurationTarget.Workspace);
                configurationProvider.refresh();
            }
        }),
        vscode.commands.registerCommand('extension.openFileWithEncoding', async (path: string, selection: vscode.Range | undefined) => {
            try {
                const buffer = fs.readFileSync(path);
                let encoding = ruleOperator.getEncoding(buffer);
                await vscode.workspace.getConfiguration().update(
                    'files.encoding', 
                    encoding,
                    vscode.ConfigurationTarget.Workspace
                );

                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
                await vscode.window.showTextDocument(doc, {
                    selection: selection
                });
            } catch (error) {
                vscode.window.showErrorMessage(`打开文件失败: ${error}`);
            }
        })
	);
}

function getParams(uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]): Array<{path: string; isDir: boolean; valid: boolean}> {
    if (!selectedUris && uriContext) {
        selectedUris = [uriContext];
    }
    if (!selectedUris || selectedUris.length === 0) {
        vscode.window.showWarningMessage("请先在资源管理器中选择要检查的文件/目录");
        return [];
    }
    const targets = selectedUris
        .map(uri => {
            try {
                const stats = fs.statSync(uri.fsPath);
                return {
                    path: uri.fsPath,
                    isDir: stats.isDirectory(),
                    valid: true
                };
            } catch (error) {
                // console.error(`Invalid path: ${uri.fsPath}`, error);
                return { 
                    path: uri.fsPath,
                    isDir: false,
                    valid: false
                };
            }
        })
        .filter(t => t.valid);
    return targets;
}

// This method is called when your extension is deactivated
export function deactivate() {}
