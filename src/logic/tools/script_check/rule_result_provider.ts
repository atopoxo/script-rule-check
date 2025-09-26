import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CheckRule, CheckResult, FileNode, DirectoryNode, DirectoryTreeItem, FileTreeItem, CheckResultTreeItem } from '../../../output_format';

export class RuleResultProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private rootNode?: DirectoryNode;
    private clientPath: string;
    
    constructor(rootPath: string, private extensionName: string) {
        this.clientPath = path.join(rootPath, 'client').replace(/\\/g, '/');
    }

    public refresh() {
        this._onDidChangeTreeData.fire();
    }

    public clear() {
        this._onDidChangeTreeData.fire();
    }

    public update(rootNode: DirectoryNode) {
        this.rootNode = rootNode;
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    public getParent(element: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem> {
        return (element as any).parent;
    }

    public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            if (this.displayMode === 'flat') {
                const allFiles: FileTreeItem[] = [];
                if (this.rootNode) {
                    this.collectAllFiles(this.rootNode, allFiles, 'flat');
                }
                return allFiles.sort((a, b) => a.fileNode.path.localeCompare(b.fileNode.path));
            } else if (this.displayMode === 'tree') {
                const results: vscode.TreeItem[] = [];
                if (this.rootNode) {
                    for (const [name, child] of this.rootNode.children) {
                        if (child instanceof DirectoryNode) {
                            const treeItem = new DirectoryTreeItem(child, 'tree');
                            results.push(treeItem);
                        } else {
                            const treeItem = new FileTreeItem(child, 'tree');
                            results.push(treeItem);
                        }
                    }
                }
                return results;
            } else {
                let ruleToCheckList = new Map<string, CheckResult[]>();
                let trees: DirectoryNode[] = [];
                if (this.rootNode) {
                    const ruleMap = new Map<string, CheckRule>();
                    this.collectAllRuleNodes(this.rootNode, ruleToCheckList, ruleMap);
                    trees = this.generateRuleTrees(ruleToCheckList, ruleMap);
                }
                const results: DirectoryTreeItem[] = [];
                trees.forEach(tree => {
                    const treeItem = new DirectoryTreeItem(tree, tree.name);
                    results.push(treeItem);
                });
                return results;
            }
        }

        if (element instanceof DirectoryTreeItem) {
            const directoryNode = element.directoryNode;
            return Array.from(directoryNode.children.values()).map(child => {
                if (child instanceof DirectoryNode) {
                    return new DirectoryTreeItem(child, element.tag);
                } else {
                    return new FileTreeItem(child, element.tag);
                }
            });
        }

        if (element instanceof FileTreeItem) {
            return element.fileNode.results.map(result => new CheckResultTreeItem(result));
        }

        return [];
    }

    public async generateExportFile(): Promise<void> {
        try {
            let results: string[] = [];
            this.printData(results, 'tree');
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

    public async setFoldState(treeView: vscode.TreeView<vscode.TreeItem>, state: boolean): Promise<void> {
        if (!treeView || !state) {
            return;
        }
        const foldCallback = async (parent: vscode.TreeItem) => {
            try {
                await treeView.reveal(parent, { expand: state });
                const children = await this.getChildren(parent);
                for (const child of children) {
                    if (child instanceof vscode.TreeItem && child.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
                        await foldCallback(child);
                    }
                }
            } catch (error) {
                console.error('展开节点时出错:', error);
            }
        };
        const items = await this.getChildren();
        for (const item of items) {
            await foldCallback(item);
        }
    }

    private get displayMode(): string {
        return vscode.workspace.getConfiguration(this.extensionName).get('displayMode', 'tree');
    }

    // private getData() {
    //     return this.rootNode;
    // }

    // private async getAllItems(parent?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    //     const items = await this.getChildren(parent);
    //     let allItems = [...items];
    //     for (const item of items) {
    //         const children = await this.getAllItems(item);
    //         allItems = [...allItems, ...children];
    //     }
    //     return allItems;
    // }

    private printData(results: string[], displayMode: string) {
        if (displayMode === 'tree' && this.rootNode) {
            this.collectTreeDataRecursive(this.rootNode, results, 0);
        }
        return results;
    }

    private collectTreeDataRecursive(node: DirectoryNode, results: string[], depth: number) {
        const indent = '  '.repeat(depth);
        for (const [name, child] of node.children) {
            if (child instanceof DirectoryNode) {
                results.push(`${indent}${name}/`);
                this.collectTreeDataRecursive(child, results, depth + 1);
            } else if (child instanceof FileNode) {
                results.push(`${indent}${name}`);
                for (const result of child.results) {
                    const value = `${indent}  报错类型:'${result.tips}', 报错行:'${result.lines.join(',')}', 报错信息:'${result.info}'`;
                    results.push(value);
                }
            }
        }
    }

    private collectAllFiles(node: DirectoryNode, files: FileTreeItem[], tag: string): void {
        for (const child of node.children.values()) {
            if (child instanceof DirectoryNode) {
                this.collectAllFiles(child, files, tag);
            } else if (child instanceof FileNode) {
                files.push(new FileTreeItem(child, tag));
            }
        }
    }

    private collectAllRuleNodes(node: DirectoryNode, ruleToFiles: Map<string, CheckResult[]>, ruleMap: Map<string, CheckRule>): void {
        for (const child of node.children.values()) {
            if (child instanceof DirectoryNode) {
                this.collectAllRuleNodes(child, ruleToFiles, ruleMap);
            } else if (child instanceof FileNode) {
                for (const result of child.results) {
                    const taskName = result.rule.taskName;
                    if (!ruleToFiles.has(taskName)) {
                        ruleToFiles.set(taskName, []);
                    }
                    ruleToFiles.get(taskName)?.push(result);
                    if (!ruleMap.has(taskName)) {
                        ruleMap.set(taskName, result.rule);
                    }
                }
            }
        }
    }

    private generateRuleTrees(ruleToCheckList: Map<string, CheckResult[]>, ruleMap: Map<string, CheckRule>): DirectoryNode[] {
        const ruleTrees: DirectoryNode[] = [];
        for (const [ruleName, checkList] of ruleToCheckList) {
            const rule = ruleMap.get(ruleName);
            if (rule) {
                const ruleTree = this.generateRuleTree(rule, checkList);
                ruleTrees.push(ruleTree);
            }
        }
        return ruleTrees;
    }

    private generateRuleTree(rule: CheckRule, checkList: CheckResult[]): DirectoryNode {
        const sortedCheckList = [...checkList].sort((a, b) => 
            a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
        );
        let directoryNode = new DirectoryNode(rule.taskName, rule.taskPath);
        for (const checkResult of sortedCheckList) {
            let relativePath = path.relative(this.clientPath, checkResult.path);
            relativePath = relativePath.replace(/\\/g, '/');
            const fileNode = new FileNode(relativePath, checkResult.path);
            fileNode.results = [checkResult];
            directoryNode.children.set(checkResult.path, fileNode);
        }
        return directoryNode;
    }
}