import "reflect-metadata";
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// import axios from 'axios';
// const { CookieJar } = require('tough-cookie');
// const { JSDOM } = require('jsdom');
const iconv = require('iconv-lite');
import { RuleOperator, RuleResultProvider } from './rule_check';
import { ContextMgr } from './core/context/context_mgr';
import { ConfigurationProvider } from './configuration';
import { CheckRule } from './output_format';
import { ChatViewProvider } from './chat_view';
import { ChatManager } from './chat_manager';
import { Storage } from './core/storage/storage';
import { AIModelMgr } from './core/ai_model/manager/ai_model_mgr';
import { getEncoding, getGlobalConfigValue } from "./core/function/base_function";
import { GameManager } from './game_manager';

const extensionName = 'script-rule-check';
const publisher = 'shaoyi';
let ruleOperator: RuleOperator;
let contextMgr: ContextMgr;
let ruleResultProvider: RuleResultProvider;
let customConfig: vscode.WorkspaceConfiguration;
let treeView: vscode.TreeView<vscode.TreeItem>;
let allCheckRules: CheckRule[] = [];
let chatManager: ChatManager;
let chatViewProvider: ChatViewProvider;
let registered = false;
const userID = "admin"
let storage: Storage;
let aiModelMgr: AIModelMgr;
let gameManager: GameManager;
gameManager = new GameManager();
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

//electron版本查看：https://releases.electronjs.org/release?channel=stable
export async function activate(context: vscode.ExtensionContext) {
    console.log(`${extensionName} actived!`);
    
    // console.log("运行环境信息:");
    // console.log("Node.js 版本:", process.version);
    // console.log("NODE_MODULE_VERSION:", process.versions.modules);
    // console.log("执行文件路径:", process.execPath);

    process.env.NODE_ENV = context.extensionMode === vscode.ExtensionMode.Development 
    ? 'development' 
    : 'production';

    const storageUri = vscode.extensions.getExtension(`${publisher}.${extensionName}`)?.extensionUri as vscode.Uri;
    const dbPath = vscode.Uri.joinPath(storageUri, 'script-rule-check.db').fsPath;
    storage = new Storage({}, userID, dbPath);
    await storage.ready;
    customConfig = vscode.workspace.getConfiguration(extensionName);
    const configurationProvider = new ConfigurationProvider(extensionName);
    await configurationProvider.init();
    vscode.window.registerTreeDataProvider('scriptRuleConfig', configurationProvider);
    const productDir = getGlobalConfigValue<string>(extensionName, 'productDir', '');
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(extensionName)) {
                customConfig = vscode.workspace.getConfiguration(extensionName);
                updateDisplayMode();
                const newDir = getGlobalConfigValue<string>(extensionName, 'productDir', '');
                if (fs.existsSync(newDir)) {
                    if (!registered) {
                        registerNormalCommands(context, configurationProvider, newDir);
                        registered = true;
                    }
                    ruleResultProvider.refresh();
                } else {
                    vscode.window.showErrorMessage(`配置路径不存在: ${newDir}`);
                }
                configurationProvider.refresh();
            }
        }),
        vscode.commands.registerCommand('extension.setProductDir', async () => {
            const currentDir = getGlobalConfigValue<string>(extensionName, 'productDir', '');
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
                    // await customConfig.update('productDir', newDir, vscode.ConfigurationTarget.Workspace);
                    await customConfig.update('productDir', newDir, vscode.ConfigurationTarget.Global);
                } else {
                    vscode.window.showErrorMessage(`配置路径不存在: ${newDir}`);
                }
            }
        }),
        vscode.commands.registerCommand('extension.openExternal', (uri: vscode.Uri) => {
            vscode.env.openExternal(uri);
        })
    );
    if (!fs.existsSync(productDir)) {
        vscode.window.showErrorMessage(`配置路径不存在: ${productDir}`);
    } else {
        if (!registered) {
            registerNormalCommands(context, configurationProvider, productDir);
            registered = true;
        }
    }
    registerAICommands(context, configurationProvider);

    updateDisplayMode();
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

function updateDisplayMode() {
    const displayMode = getGlobalConfigValue<string>(extensionName, 'displayMode', 'tree');
    vscode.commands.executeCommand('setContext', `${extensionName}.displayMode`, displayMode);
    return displayMode;
}

async function registerAICommands(context: vscode.ExtensionContext, configurationProvider: ConfigurationProvider) {
    contextMgr = new ContextMgr(extensionName);
    await contextMgr.init();
    aiModelMgr = new AIModelMgr(configurationProvider.getConfig(), extensionName, storage, contextMgr);
    const defaultModel = await aiModelMgr.getSelectedModel();
    const defaultModelId = defaultModel ? defaultModel.id : '';
    const defaultToolModel = await aiModelMgr.getSelectedToolModel();
    const defaultToolModelId = defaultToolModel ? defaultToolModel.id : '';
    chatManager = ChatManager.getInstance(context, extensionName, userID, storage, defaultModelId, defaultToolModelId, aiModelMgr);
    await chatManager.ready;
    chatViewProvider = new ChatViewProvider(context, chatManager, aiModelMgr, contextMgr);
    // chatViewProvider.createWebview();
	const allModelInfos = aiModelMgr.getModelInfos();
    configurationProvider.setModelInfos(allModelInfos);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('chatView', chatViewProvider),
        vscode.commands.registerCommand('extension.toggleModelInfo', async (modelID: string) => {
            let selectedModel: string = getGlobalConfigValue<string>(extensionName, 'selectedModel', '');
            selectedModel = selectedModel === modelID ? '' : modelID;
            await customConfig.update('selectedModel', selectedModel, vscode.ConfigurationTarget.Global);
            configurationProvider.refresh();
        }),
        vscode.commands.registerCommand('extension.model.editInfo', async (modelID: string, data: object) => {
            const modelInfo = allModelInfos.find(info => info.id === modelID);
            if (!modelInfo) {
                vscode.window.showErrorMessage(`未找到 ID 为 ${modelID} 的模型。`);
                return;
            }
            const entries = Object.entries(data);
            await entries.forEach(async ([key, value]) => {
                const newValue = await vscode.window.showInputBox({
                    prompt: `请输入模型"${modelInfo.name}"的新属性"${key}"`,
                    value: value || ''
                });
                if (newValue === undefined) {
                    return;
                }
                (modelInfo as any)[key] = newValue;
                aiModelMgr.saveModelConfig("models", allModelInfos);
                configurationProvider.refresh();
                vscode.window.showInformationMessage(`模型"${modelInfo.name}"的"${key}"已更新为"${newValue}"`);
            })
        }),
        vscode.commands.registerCommand('extension.toolModel.selectedChange', async (id: string) => {
            const toolModelInfo = allModelInfos.find(info => info.id === id);
            if (!toolModelInfo) {
                vscode.window.showErrorMessage(`未找到 ID 为 ${id} 的模型。`);
                return;
            }
            const selectedModelId = getGlobalConfigValue<string>(extensionName, 'selectedModel', '');
            const modelInfo = allModelInfos.find(info => info.id === selectedModelId);
            if (!modelInfo) {
                vscode.window.showErrorMessage(`未找到 ID 为 ${selectedModelId} 的模型。`);
                return;
            }
            if (toolModelInfo.codeName != modelInfo.codeName) {
                vscode.window.showErrorMessage(`当前工具模型${toolModelInfo.name}与当前模型${modelInfo.name}不匹配。`);
                return;
            }
            await aiModelMgr.setSelectedToolModel(id, userID, 'chat');
            await customConfig.update('selectedToolModel', id, vscode.ConfigurationTarget.Global);
        }),
        vscode.commands.registerCommand('extension.aiCharacter.editInfo', async (id: string, data: object) => {
            const infos = getGlobalConfigValue<any[]>(extensionName, 'aiCharacterInfos', []) || [];
            const currentInfo = infos.find(info => info.id === id);
            if (!currentInfo) {
                vscode.window.showErrorMessage(`未找到 ID 为 ${id} 的AI角色。`);
                return;
            }
            const entries = Object.entries(data);
            await entries.forEach(async ([key, value]) => {
                const newValue = await vscode.window.showInputBox({
                    prompt: `请输入角色"${currentInfo.name}"的新属性"${key}"`,
                    value: value || ''
                });
                if (newValue === undefined) {
                    return;
                }
                (currentInfo as any)[key] = newValue;
                const index = infos.findIndex((info: any) => info.id === id);
                if (index !== -1) {
                    infos[index] = currentInfo;
                } else {
                    infos.push(currentInfo);
                }
                await customConfig.update('aiCharacterInfos', infos, vscode.ConfigurationTarget.Global);
                configurationProvider.setAICharacterInfos(infos);
                configurationProvider.refresh();
                vscode.window.showInformationMessage(`ai角色"${currentInfo.name}"的"${key}"已更新为"${newValue}"`);
            })
        }),
        vscode.commands.registerCommand('extension.aiCharacter.add', async () => {
            await configurationProvider.addAICharacter();
            chatViewProvider.selectAICharacter();
        }),
        vscode.commands.registerCommand('extension.aiCharacter.remove', async (item: vscode.TreeItem) => {
            if (item.id) {
                const confirm = await vscode.window.showWarningMessage(
                    `确定要删除角色 "${item.label}" 吗?`, 
                    { modal: true }, 
                    '确定'
                );
                if (confirm === '确定') {
                    await configurationProvider.removeAICharacter(item.id);
                    chatViewProvider.selectAICharacter();
                }
            }
        }),
        vscode.commands.registerCommand('extension.aiCharacter.selectedChange', async (id: string) => {
            await customConfig.update('selectedAICharacter', id, vscode.ConfigurationTarget.Global);
            chatViewProvider.selectAICharacter();
        }),
        vscode.commands.registerCommand('extension.searchEngine.editInfo', async (id: string, data: object) => {
            const infos = getGlobalConfigValue<any[]>(extensionName, 'searchEngineInfos', []) || [];
            const currentInfo = infos.find(info => info.id === id);
            if (!currentInfo) {
                vscode.window.showErrorMessage(`未找到 ID 为 ${id} 的搜索引擎。`);
                return;
            }
            const entries = Object.entries(data);
            await entries.forEach(async ([key, value]) => {
                const newValue = await vscode.window.showInputBox({
                    prompt: `请输入搜索引擎"${currentInfo.name}"的新属性"${key}"`,
                    value: value || ''
                });
                if (newValue === undefined) {
                    return;
                }
                (currentInfo as any)[key] = newValue;
                const index = infos.findIndex((info: any) => info.id === id);
                if (index !== -1) {
                    infos[index] = currentInfo;
                } else {
                    infos.push(currentInfo);
                }
                await customConfig.update('searchEngineInfos', infos, vscode.ConfigurationTarget.Global);
                configurationProvider.setSearchEngineInfos(infos);
                configurationProvider.refresh();
                vscode.window.showInformationMessage(`搜索引擎"${currentInfo.name}"的"${key}"已更新为"${newValue}"`);
            })
        }),
        vscode.commands.registerCommand('extension.searchEngine.add', async () => {
            await configurationProvider.addSearchEngine();
        }),
        vscode.commands.registerCommand('extension.searchEngine.remove', async (item: vscode.TreeItem) => {
            if (item.id) {
                const confirm = await vscode.window.showWarningMessage(
                    `确定要删除搜索引擎 "${item.label}" 吗?`, 
                    { modal: true }, 
                    '确定'
                );
                if (confirm === '确定') {
                    await configurationProvider.removeSearchEngine(item.id);
                }
            }
        }),
        vscode.commands.registerCommand('extension.searchEngine.selectedChange', async (id: string) => {
            await customConfig.update('selectedSearchEngine', id, vscode.ConfigurationTarget.Global);
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                chatViewProvider.showContextOptions(undefined);
            }
        }),
        vscode.commands.registerCommand('extension.chat.addContext', async () => {
            const isWebViewCreated = await chatViewProvider.isViewCreated();
            if (isWebViewCreated) {
                await chatViewProvider.addContext();
            } else {
                console.log("聊天视图未创建，请重试...");
            }
        }),
        vscode.commands.registerCommand('extension.chat.checkCode', async () => {
            const isWebViewCreated = await chatViewProvider.isViewCreated();
            if (isWebViewCreated) {
                await chatViewProvider.checkCode();
            } else {
                console.log("聊天视图未创建，请重试...");
            }
        })
    );
}

function registerNormalCommands(context: vscode.ExtensionContext, configurationProvider: ConfigurationProvider, productDir: string) {
    const toolDir = path.join(productDir, "tools/CheckScripts/CheckScripts");
    const ruleDir = path.join(toolDir, "Case");
    ruleOperator = new RuleOperator(productDir);
	ruleResultProvider = new RuleResultProvider(productDir, extensionName);
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
            let selectedRules: string[] = getGlobalConfigValue<string[]>(extensionName, 'customCheckRules', []);
            selectedRules = selectedRules.includes(ruleId) ? selectedRules.filter(id => id !== ruleId) : [...selectedRules, ruleId];
            await customConfig.update('customCheckRules', selectedRules, vscode.ConfigurationTarget.Global);
            configurationProvider.refresh();
        }),
        vscode.commands.registerCommand('extension.checkCustomRules', async (uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
            const selectedRules = getGlobalConfigValue<string[]>(extensionName, 'customCheckRules', []);
            if (selectedRules.length === 0) {
                vscode.window.showWarningMessage('未选择任何自定义检查规则，请在配置中选择。');
                return;
            }
            const rulesToCheck = allCheckRules.filter(rule => selectedRules.includes(rule.id));
            await vscode.commands.executeCommand('extension.checkSpecificRules', uriContext, selectedUris, rulesToCheck);
        }),
        vscode.commands.registerCommand('extension.reloadScript', async (uriContext?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
            gameManager.doGMCommand(uriContext, selectedUris);
        }),
        vscode.commands.registerCommand('extension.openFileWithEncoding', async (path: string, selection: vscode.Range | undefined) => {
            try {
                const buffer = fs.readFileSync(path);
                let encoding = getEncoding(buffer);
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
        }),
        vscode.commands.registerCommand('extension.downloadScriptCheckResult', async () => {
            await generateExportFile();
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

async function generateExportFile() {
    try {
        let results: string[] = [];
        ruleResultProvider.printData(results, 'tree');
        const json = JSON.stringify(results, null, 2);
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('script_check_result.json'),
            filters: {
                'JSON Files': ['json'],
                'All Files': ['*']
            },
            saveLabel: '保存检查结果'
        });
        if (!uri) {
            return;
        }
        fs.writeFileSync(uri.fsPath, json);
        vscode.window.showInformationMessage(`检查结果已保存到: ${uri.fsPath}`);
    } catch (error) {
        vscode.window.showErrorMessage(`保存文件时出错: ${error}`);
    }
}

async function checkRules(targets: Array<{path: string; isDir: boolean; valid: boolean}>, rules: CheckRule[], productDir: string, toolDir: string, ruleDir: string) { 
    await vscode.commands.executeCommand('ruleCheckResults.focus');
    const logDir = path.join(toolDir, "Log");
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    const luaExe = path.join(toolDir, "lua/5.1/lua.exe");
    const pythonExe = path.join(toolDir, "Python310/python.exe");
    const cwd = ruleDir;
    const luaParams = "io.stdout:setvbuf('no')";

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
