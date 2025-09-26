import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CheckRule } from '../../../output_format';
import { RuleOperator } from './rule_operator';
import { RuleResultProvider } from './rule_result_provider';
import { singleton, getGlobalConfigValue } from '../../../core/function/base_function';

@singleton
export class ScriptCheck {
    private ruleOperator: RuleOperator;
    private ruleResultProvider: RuleResultProvider;
    private treeView: vscode.TreeView<vscode.TreeItem>;
    private allCheckRules: CheckRule[] = [];
    private extensionName: string;
    private lastUris: vscode.Uri[];

    constructor(config: any) {
        this.extensionName = config.extensionName;
        const productDir = getGlobalConfigValue<string>(this.extensionName, 'productDir', '');
        this.ruleOperator = new RuleOperator(productDir);
        this.ruleResultProvider = new RuleResultProvider(productDir, this.extensionName);
        this.treeView = vscode.window.createTreeView('scriptCheck', {
            treeDataProvider: this.ruleResultProvider
        });
        this.lastUris = vscode.window.activeTextEditor?.document.uri ? [vscode.window.activeTextEditor?.document.uri] : [];
    }

    public explorerSelectedChange(uri?: vscode.Uri, uris?: vscode.Uri[]): void {
        if (!uris && uri) {
            uris = [uri];
        }
        if (!uris || uris.length === 0) {
            uris = [];
        }
        this.lastUris = uris;
    }

    public getScriptCheckRules(toolDir: string, ruleDir: string): CheckRule[] {
        if (this.allCheckRules.length <= 0) {
            this.allCheckRules = this.ruleOperator.getScriptCheckRules(toolDir, ruleDir);
        }
        return this.allCheckRules;
    }

    public getResultProvider(): RuleResultProvider {
        return this.ruleResultProvider;
    }

    public getTreeView(): vscode.TreeView<vscode.TreeItem> {
        return this.treeView;
    }

    public async setFoldState(state: boolean): Promise<void> {
        await this.ruleResultProvider.setFoldState(this.treeView, state);
    }

    public async generateExportFile(): Promise<void> {
        await this.ruleResultProvider.generateExportFile();
    }

    public resultProviderRefresh() {
        this.ruleResultProvider.refresh();
    }

    public async checkByRulesType(pathType: string, ruleType: string): Promise<object> {
        let result = {
            ai_data: "😭执行脚本检查的过程中出错，具体报错信息请留意弹框，若问题持续存在请联系开发人员"
        };
        const productDir = getGlobalConfigValue<string>(this.extensionName, 'productDir', '');
        if (!fs.existsSync(productDir)) {
            vscode.window.showErrorMessage(`产品库路径'${productDir}'不存在,或路径错误`);
            return result;
        }
        let selectedUris: vscode.Uri[] = [];
        let targets: Array<{path: string; isDir: boolean; valid: boolean}> = [];
        switch(pathType) {
            case 'currentChoice':
                selectedUris = this.getSelectedUrisFromExplorer();
                if (selectedUris.length === 0) {
                    vscode.window.showWarningMessage("请先在资源管理器中选择要检查的脚本");
                }
                break;
            case 'currentEdit':
                selectedUris = vscode.window.activeTextEditor?.document.uri ? [vscode.window.activeTextEditor?.document.uri] : [];
                if (selectedUris.length === 0) {
                    vscode.window.showWarningMessage("请先在vscode中打开该脚本");
                }
                break;
            default:
                const relativePath = pathType.replace('arbitrary:', '');
                let absolutePath: string;
                if (path.isAbsolute(relativePath)) {
                    absolutePath = relativePath;
                } else {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders && workspaceFolders.length > 0) {
                        absolutePath = path.join(workspaceFolders[0].uri.fsPath, relativePath);
                        selectedUris = [vscode.Uri.file(absolutePath)];
                    } else if (productDir) {
                        absolutePath = path.join(productDir, relativePath);
                        selectedUris = [vscode.Uri.file(absolutePath)];
                    } else {
                        vscode.window.showErrorMessage(`无法解析路径: ${relativePath}。请确保已打开工作空间或配置了产品目录。`);
                    }
                }
                break;
        }
        if (selectedUris.length === 0) {
            return result;
        }
        targets = this.getParams(undefined, selectedUris);
        let rules: CheckRule[] = [];
        switch(ruleType) {
            case 'custom':
                const selectedRules = getGlobalConfigValue<string[]>(this.extensionName, 'customCheckRules', []);
                if (selectedRules.length === 0) {
                    vscode.window.showWarningMessage('未选择任何自定义检查规则，请在配置中选择。');
                }
                rules = this.allCheckRules.filter(rule => selectedRules.includes(rule.id));
                break;
            default:
                rules = this.allCheckRules;
                break;
        }
        const toolDir = path.join(productDir, "tools/CheckScripts/CheckScripts");
        const ruleDir = path.join(toolDir, "Case");
        await this.checkRules(targets, rules, productDir, toolDir, ruleDir);
        result.ai_data = "😊已成功执行脚本检查，请查看'SCRIPT CHECK RESULTS'窗口";
        return result;
    }

    public getParams(uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]): Array<{path: string; isDir: boolean; valid: boolean}> {
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

    public async checkRules(targets: Array<{path: string; isDir: boolean; valid: boolean}>, rules: CheckRule[], productDir: string, toolDir: string, ruleDir: string) { 
        let self = this;
        await vscode.commands.executeCommand('scriptCheck.focus');
            const logDir = path.join(toolDir, "Log");
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            const luaExe = path.join(toolDir, "lua/5.1/lua.exe");
            const pythonExe = path.join(toolDir, "Python310/python.exe");
            const cwd = ruleDir;
            const luaParams = "io.stdout:setvbuf('no')";

            self.ruleResultProvider.clear();
            self.ruleOperator.clearResults();
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
                        await self.ruleOperator.processRuleFile(rule, logDir, luaExe, pythonExe, luaParams, target.path, productDir, cwd);
                    }
                }
                let rootNode = self.ruleOperator.getVirtualRoot(false, targets);
                self.ruleResultProvider.update(rootNode);
                const issueCount = self.ruleOperator.getIssueCount();
                this.treeView.description = `${issueCount} issues`;
            });
    }

    private getSelectedUrisFromExplorer(): vscode.Uri[] {
        try {
            return this.lastUris;
        } catch (error) {
            vscode.window.showErrorMessage("获取选中路径失败");
        }
        return [];
    }
}