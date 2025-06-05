import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// import axios from 'axios';
// const { CookieJar } = require('tough-cookie');
// const { JSDOM } = require('jsdom');
const iconv = require('iconv-lite');
import {RuleOperator, RuleResultProvider} from './rule_check';
import {ConfigurationProvider} from './configuration';
import {CheckRule} from './output_format';
import { ChatViewProvider, ChatViewTreeDataProvider } from './chat_view';
import { ChatManager } from './chat_manager';
import { ReferenceSystem } from './reference_system';
import { ModelSelector } from './model_selector';

let ruleOperator: RuleOperator;
let ruleResultProvider: RuleResultProvider;
let customConfig: vscode.WorkspaceConfiguration;
let treeView: vscode.TreeView<vscode.TreeItem>;
let allCheckRules: CheckRule[] = [];
let chatManager: ChatManager;
let chatViewProvider: ChatViewProvider;
let registered = false;
const extensionName = 'script-rule-check';
const publisher = 'shaoyi';
// const EXTENSION_ID = `${publisher}.${extensionName}`;
// const VERSION_CHECK_URL = `https://marketplace.visualstudio.com/manage/publishers/${publisher}`;

// interface Version {
//     version: string;
//     flags: string;
//     lastUpdated: string;
//     files: Array<{
//         assetType: string;
//         source: string;
//     }>;
//     assetUri: string;
//     fallbackAssetUri: string;
// }
export function activate(context: vscode.ExtensionContext) {
    console.log(`${extensionName} actived!`);
    
    process.env.NODE_ENV = context.extensionMode === vscode.ExtensionMode.Development 
    ? 'development' 
    : 'production';

    customConfig = vscode.workspace.getConfiguration(extensionName);
    const configurationProvider = new ConfigurationProvider(customConfig);
    vscode.window.registerTreeDataProvider('scriptRuleConfig', configurationProvider);
    const productDir = customConfig.get<string>('productDir', '');
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(extensionName)) {
                customConfig = vscode.workspace.getConfiguration(extensionName);
                updateDisplayMode(customConfig);
                const newDir = customConfig.get<string>('productDir', '');
                if (fs.existsSync(newDir)) {
                    if (!registered) {
                        registerNormalCommands(context, configurationProvider, newDir);
                        registered = true;
                    }
                    ruleResultProvider.refresh();
                } else {
                    vscode.window.showErrorMessage(`配置路径不存在: ${newDir}`);
                }
                configurationProvider.refresh(customConfig);
            }
        }),
        vscode.commands.registerCommand('extension.setProductDir', async () => {
            const currentDir = customConfig.get<string>('productDir', '');
            const newDir = await vscode.window.showInputBox({
                value: currentDir,
                prompt: '输入产品库目录'
            });
            if (newDir !== undefined) {
                if (fs.existsSync(newDir)) {
                    if (!registered) {
                        registerNormalCommands(context, configurationProvider, newDir);
                        registered = true;
                    }
                    await customConfig.update('productDir', newDir, vscode.ConfigurationTarget.Workspace);
                } else {
                    vscode.window.showErrorMessage(`配置路径不存在: ${newDir}`);
                }
            }
        })
    );
    if (!fs.existsSync(productDir)) {
        vscode.window.showErrorMessage(`配置路径不存在: ${productDir}`);
        return;
    }
    if (!registered) {
        registerNormalCommands(context, configurationProvider, productDir);
        registered = true;
    }
    registerAICommands(context, configurationProvider);

    updateDisplayMode(customConfig);
    // checkAndForceUpdate(context);
}

// async function checkAndForceUpdate(context: vscode.ExtensionContext) {
//     const currentVersion = vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON.version;
//     const latestVersion = await getLastVersion(currentVersion);
//     if (latestVersion && currentVersion !== latestVersion) {
//         const choice = await vscode.window.showWarningMessage(
//             `必须更新插件到 v${latestVersion} 才能继续使用 (当前版本: v${currentVersion})`,
//             { modal: true },
//             '立即更新'
//         );
//         if (choice === '立即更新') {
//             await saveWorkspaceState();
//             vscode.commands.executeCommand('workbench.extensions.installExtension', EXTENSION_ID);
//             vscode.commands.executeCommand('workbench.action.reloadWindow');
//         } else {
//             context.subscriptions.forEach(d => d.dispose());
//             vscode.window.showErrorMessage('插件已禁用，请更新后重启VSCode');
//         }
//     }
// }

// async function getLastVersion(currentVersion: string) {
//     let version = undefined;
//     try{
//         const cookieJar = new CookieJar();
//         const instance = axios.create({
//             headers: {
//                 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
//                 'Accept-Language': 'en-US,en;q=0.9'
//             },
//             timeout: 20000,
//             validateStatus: () => true
//         });
//         instance.interceptors.response.use((response) => {
//             const cookies = response.headers['set-cookie'];
//             if (cookies) {
//                 cookies.forEach(cookie => {
//                     cookieJar.setCookieSync(cookie, response.config.url);
//                 });
//             }
//             return response;
//         });
//         const { data } = await instance.get(VERSION_CHECK_URL);
//         const dom = new JSDOM(data);
//         const doc = dom.window.document;
//         const publisherDataScript = doc.querySelector('script.publisher-data');
//         if (publisherDataScript) {
//             const jsonData = JSON.parse(publisherDataScript.textContent);
//             const targetVersions = jsonData?.publisherTenants?.[0]?.publishers?.[0]?.extensions?.[0]?.versions;
//             if (targetVersions) {
//                 const result = {
//                     versions: targetVersions.map((version: Version) => ({
//                         version: version.version,
//                         flags: version.flags,
//                         lastUpdated: version.lastUpdated,
//                         files: version.files.map(file => ({
//                             assetType: file.assetType,
//                             source: file.source
//                         })),
//                         assetUri: version.assetUri,
//                         fallbackAssetUri: version.fallbackAssetUri
//                     }))
//                 };
                
//                 console.log(JSON.stringify(result, null, 2));
//             } 
//         }
//     } catch (error) {
//         console.error('Error fetching extension version:', error);
//     } finally {
//         return version;
//     }
    
// }

async function saveWorkspaceState() {
    const unsavedDocs = vscode.workspace.textDocuments.filter(doc => doc.isDirty);
    await Promise.all(unsavedDocs.map(doc => doc.save()));
}

function updateDisplayMode(customConfig: vscode.WorkspaceConfiguration) {
    const displayMode = customConfig.get<string>('displayMode', 'tree');
    vscode.commands.executeCommand('setContext', `${extensionName}.displayMode`, displayMode);
    return displayMode;
}

function registerAICommands(context: vscode.ExtensionContext, configurationProvider: ConfigurationProvider) {
    chatManager = ChatManager.getInstance(context);
    chatViewProvider = new ChatViewProvider(context, chatManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('chatView', chatViewProvider),
        vscode.commands.registerCommand('extension.chat.createSession', async () => {
            await chatViewProvider.createSession();
        }),
        vscode.commands.registerCommand('extension.chat.showHistory', () => {
            chatViewProvider.showHistory();
        }),
        vscode.commands.registerCommand('extension.chat.deleteHistorySession', async (sessionId: string) => {
            await chatViewProvider.deleteSession(sessionId);
        }),
        vscode.commands.registerCommand('extension.chat.sendMessage', async () => {
            // 发送消息实现
        }),
        vscode.commands.registerCommand('extension.chat.cancelResponse', () => {
            // 取消响应实现
        }),
        vscode.commands.registerCommand('extension.chat.addReference', async () => {
            await chatViewProvider.addReference();
        }),
        vscode.commands.registerCommand('extension.chat.selectModel', async () => {
            await chatViewProvider.selectModel();
        }),
        // vscode.commands.registerCommand('extension.chat.addCodeReference', async () => {
        //     const reference = await ReferenceSystem.addCodeReference();
        //     if (reference) {
        //         chatViewProvider.addReference(reference);
        //     }
        // }),
        // vscode.commands.registerCommand('extension.chat.addFileReference', async () => {
        //     const reference = await ReferenceSystem.addFileReference();
        //     if (reference) {
        //         chatViewProvider.addReference(reference);
        //     }
        // }),
        // vscode.commands.registerCommand('extension.chat.addFolderReference', async () => {
        //     const reference = await ReferenceSystem.addFolderReference();
        //     if (reference) {
        //         chatViewProvider.addReference(reference);
        //     }
        // }),
        vscode.commands.registerCommand('extension.chat.addSelectionToChat', async () => {
            await chatViewProvider.addSelectionToChat();
        })
    );
}

function registerNormalCommands(context: vscode.ExtensionContext, configurationProvider: ConfigurationProvider, productDir: string) {
    const toolDir = path.join(productDir, "tools/CheckScripts/CheckScripts");
    const ruleDir = path.join(toolDir, "Case");
    ruleOperator = new RuleOperator(productDir);
	ruleResultProvider = new RuleResultProvider(ruleOperator, productDir, extensionName);
    allCheckRules = ruleOperator.getScriptCheckRules(toolDir, ruleDir);
	configurationProvider.setCheckRules(allCheckRules);
    treeView = vscode.window.createTreeView('ruleCheckResults', {
		treeDataProvider: ruleResultProvider
	});
    context.subscriptions.push(
        treeView,
		vscode.commands.registerCommand('extension.checkAllRules', async (uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
            await vscode.commands.executeCommand('extension.checkSpecificRules', uriContext, selectedUris, allCheckRules);
		}),
        vscode.commands.registerCommand('extension.checkSpecificRules', async (uriContext?: vscode.Uri, selectedUris?: vscode.Uri[], rules?: CheckRule[]) => {
            const targets = getParams(uriContext, selectedUris);
            const finalRules = rules || allCheckRules;
            await checkRules(targets, finalRules, productDir, toolDir, ruleDir);
		}),
        vscode.commands.registerCommand('extension.toggleCustomCheckRules', async (ruleId: string) => {
            let selectedRules: string[] = customConfig.get('customCheckRules', []);
            selectedRules = selectedRules.includes(ruleId) ? selectedRules.filter(id => id !== ruleId) : [...selectedRules, ruleId];
            await customConfig.update('customCheckRules', selectedRules, vscode.ConfigurationTarget.Global);
            configurationProvider.refresh(customConfig);
        }),
        vscode.commands.registerCommand('extension.checkCustomRules', async (uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
            const selectedRules = customConfig.get<string[]>('customCheckRules', []);
            if (selectedRules.length === 0) {
                vscode.window.showWarningMessage('未选择任何自定义检查规则，请在配置中选择。');
                return;
            }
            const rulesToCheck = allCheckRules.filter(rule => selectedRules.includes(rule.id));
            await vscode.commands.executeCommand('extension.checkSpecificRules', uriContext, selectedUris, rulesToCheck);
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
        }),
        vscode.commands.registerCommand('extension.expandAllNodes', async () => {
            await ruleResultProvider.setFoldState(treeView, true);
        }),
        vscode.commands.registerCommand('extension.collapseAllNodes', async () => {
            vscode.commands.executeCommand('workbench.actions.treeView.ruleCheckResults.collapseAll');
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
}
async function checkRules(targets: Array<{path: string; isDir: boolean; valid: boolean}>, rules: CheckRule[], productDir: string, toolDir: string, ruleDir: string) { 
    const logDir = path.join(toolDir, "Log");
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    const luaExe = path.join(toolDir, "lua/5.1/lua.exe");
    const pythonExe = path.join(toolDir, "Python310/python.exe");
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
                await ruleOperator.processRuleFile(rule, logDir, luaExe, pythonExe, luaParams, target.path, productDir, cwd);
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
