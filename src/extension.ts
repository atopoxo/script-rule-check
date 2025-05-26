import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const iconv = require('iconv-lite');
import {RuleOperator, RuleResultProvider} from './rule_check';
import {ConfigurationProvider} from './configuration';
import {CheckRule} from './output_format';

let ruleOperator: RuleOperator;
let ruleResultProvider: RuleResultProvider;
let customConfig: vscode.WorkspaceConfiguration;
let treeView: vscode.TreeView<vscode.TreeItem>;
export function activate(context: vscode.ExtensionContext) {
    console.log("script-rule-check actived!");
    customConfig = vscode.workspace.getConfiguration('script-rule-check');
    const productDir = customConfig.get<string>('productDir', 'z:/trunk');
    if (!fs.existsSync(productDir)) {
        vscode.window.showErrorMessage(`配置路径不存在: ${productDir}`);
        return;
    }
    ruleOperator = new RuleOperator();
	ruleResultProvider = new RuleResultProvider(ruleOperator);
    const toolDir = path.join(productDir, "tools/CheckScripts/CheckScripts");
    const ruleDir = path.join(toolDir, "Case");
    const allCheckRules = ruleOperator.getScriptCheckRules(toolDir, ruleDir);
	const configurationProvider = new ConfigurationProvider();
    vscode.window.registerTreeDataProvider('scriptRuleConfig', configurationProvider);
    treeView = vscode.window.createTreeView('ruleCheckResults', {
		treeDataProvider: ruleResultProvider
	});
    const updateDisplayMode = () => {
        const displayMode = customConfig.get<string>('displayMode', 'tree');
        vscode.commands.executeCommand('setContext', 'script-rule-check.displayMode', displayMode);
        return displayMode;
    };
    let currentDisplayMode = updateDisplayMode();

    const watcher = fs.watch(ruleDir, (eventType, filename) => {
        if (filename != undefined) {
            if (filename.endsWith('.lua') || filename.endsWith('.py')) {
                vscode.window.showInformationMessage('检测到规则文件变更，重新加载菜单...');
                updateSubMenu(context, allCheckRules);
            }
        }
    });

	context.subscriptions.push(
        // { dispose: () => watcher.close() },
        treeView,
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('script-rule-check')) {
                customConfig = vscode.workspace.getConfiguration('script-rule-check');
                currentDisplayMode = updateDisplayMode();
                ruleResultProvider.refresh();
                configurationProvider.refresh();
            }
        }),
		vscode.commands.registerCommand('extension.checkAllRules', async (uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
            await vscode.commands.executeCommand('extension.checkSpecificRules', uriContext, selectedUris, allCheckRules);
		}),
        vscode.commands.registerCommand('extension.checkSpecificRules', async (uriContext?: vscode.Uri, selectedUris?: vscode.Uri[], rules?: CheckRule[]) => {
            const targets = getParams(uriContext, selectedUris);
            const finalRules = rules || allCheckRules;
            await checkRules(targets, finalRules, productDir, toolDir, ruleDir);
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
        }),
        vscode.commands.registerCommand('extension.setDisplayMode', async (mode) => {
            await customConfig.update('displayMode', mode, vscode.ConfigurationTarget.Global);
        }),
        vscode.commands.registerCommand('extension.setDisplayTreeMode', async () => {
            await customConfig.update('displayMode', 'tree', vscode.ConfigurationTarget.Global);
        }),
        vscode.commands.registerCommand('extension.setDisplayFlatMode', async () => {
            await customConfig.update('displayMode', 'flat', vscode.ConfigurationTarget.Global);
        }),
        vscode.commands.registerCommand('extension.setDisplayRuleMode', async () => {
            await customConfig.update('displayMode', 'rule', vscode.ConfigurationTarget.Global);
        })
	);

    allCheckRules.forEach(rule => {
        const commandId = `extension.checkSpecificRule.${rule.id}`;
        context.subscriptions.push(
            vscode.commands.registerCommand(commandId, async (uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
                await vscode.commands.executeCommand('extension.checkSpecificRules', uriContext, selectedUris, [rule]);
            })
        );
    });

    // updateSubMenu(context, allCheckRules);
}

async function updateSubMenu(context: vscode.ExtensionContext, rules: CheckRule[]) {
    await vscode.commands.executeCommand('setContext', 'dynamicMenuItems',
        rules.map(rule => ({
            command: `extension.checkSpecificRule.${rule.id}`,
            title: rule.taskName
        }))
    );
    await vscode.commands.executeCommand('setContext', 'hasDynamicItems', true);
    await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
}

async function checkRules(targets: Array<{path: string; isDir: boolean; valid: boolean}>, rules: CheckRule[], productDir: string, toolDir: string, ruleDir: string) { 
    const logDir = path.join(toolDir, "Log");
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    const luaExe = path.join(toolDir, "lua/5.1/lua.exe");
    const cwd = ruleDir;
    const luaParams = "io.stdout:setvbuf('no')"

    ruleResultProvider.clear();
    ruleOperator.clearResults();
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Script Rule Check Progress",
        cancellable: true
    }, async (progress, token) => {
        const totalTasks = targets.length * rules.length;
        let completedTasks = 0;
        for (const target of targets) {
            for (const rule of rules) {
                if (token.isCancellationRequested) {
                    vscode.window.showInformationMessage("用户取消操作");
                    return;
                }
                progress.report({
                    message: `目标: ${path.basename(target.path)} - 规则: ${path.basename(rule.taskName)} (${++completedTasks}/${totalTasks})`,
                    increment: (100 / totalTasks)
                });
                await ruleOperator.processRuleFile(rule, logDir, luaExe, luaParams, target.path, productDir, cwd);
            }
        }
        let rootNode = ruleOperator.getVirtualRoot(false, targets);
        ruleResultProvider.update(rootNode);
        const issueCount = ruleOperator.getIssueCount();
        treeView.description = `${issueCount} issues`;
    });
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
