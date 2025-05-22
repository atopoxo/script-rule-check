import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
const iconv = require('iconv-lite');
const chardet = require('chardet');
import { exec } from 'child_process';
import {CheckResult, FileNode, DirectoryNode, DirectoryTreeItem, FileTreeItem, CheckResultTreeItem} from './output_format';

export class RuleResultProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private rootNode?: DirectoryNode;

    clear() {
        this.rootNode = undefined;
        this._onDidChangeTreeData.fire();
    }
    update(rootNode: DirectoryNode) {
        this.rootNode = rootNode;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            return this.rootNode ? [new DirectoryTreeItem(this.rootNode)] : [];
        }

        if (element instanceof DirectoryTreeItem) {
            const directoryNode = element.directoryNode;
            return Array.from(directoryNode.children.values()).map(child => {
                if (child instanceof DirectoryNode) {
                    return new DirectoryTreeItem(child);
                } else {
                    return new FileTreeItem(child);
                }
            });
        }

        if (element instanceof FileTreeItem) {
            return element.fileNode.results.map(result => new CheckResultTreeItem(result));
        }

        return [];
    }
}

export class RuleOperator {
    private resultsMap = new Map<string, CheckResult[]>();

    getRuleFiles(toolDir: string, ruleDir: string) {
        const ruleFiles = (() => {
            try {
                const caseInfoPath = path.join(toolDir, "CaseInfo.tab");
                const buffer = fs.readFileSync(caseInfoPath);
                const content = iconv.decode(buffer, 'gbk') as string;
                
                return content.split('\n')
                    .slice(1) // 跳过标题行
                    .filter(line => line.trim()) // 过滤空行
                    .map(line => {
                        const [taskName, taskPath, isChecked] = line.split('\t');
                        return {
                            taskName: taskName.trim(),
                            taskPath: path.join(ruleDir, taskPath.trim()),
                            isChecked: isChecked.trim() === '1' // 假设1表示true，0表示false
                        };
                    })
                    .map(item => item.taskPath)
                    .filter(filePath => {
                        const ext = path.extname(filePath).toLowerCase();
                        return ext === '.lua' || ext === '.py';
                    });
            } catch (error) {
                console.error('读取CaseInfo.tab文件失败:', error);
                return [];
            }
        })();
        return ruleFiles;
    }

    async processRuleFile(ruleFile: string, logDir: string, luaExe: string, luaParams: string, checkPath: string, productDir: string, cwd: string) {
        const ext = path.extname(ruleFile);
        const logPath = path.join(logDir, path.basename(ruleFile, ext) + '.log');
        const command = ext === '.lua' ? 
            `${luaExe} -e "${luaParams}" "${ruleFile}" "${logPath}" "${checkPath}" "${productDir}"` : 
            `python "${ruleFile}" "${logPath}" "${checkPath}" "${productDir}"`;
        try {
            fs.existsSync(logPath) && fs.unlinkSync(logPath);
            await new Promise<void>((resolve, reject) => {
                exec(command, { cwd: cwd }, (err) => {
                    err ? reject(err) : resolve();
                });
            });
            if (fs.existsSync(logPath)) {
                const logBuffer = fs.readFileSync(logPath);
                const output = iconv.decode(logBuffer, 'utf-8') as string;
                output.split('\n').forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed) {
                        return;
                    }
                    const match = trimmed.match(/^((?:\[[^\]]+\]\s*)+)\s+(.*?)\s+文件中，第\s+(\d+(?:,\d+)*), ?\s+行,(.*)$/);
                    if (match) {
                        const tags = Array.from(match[1].matchAll(/\[([^\]]+)\]/g)).map(m => m[1]);
                        const filePath = match[2].trim();
                        const lines = match[3].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                        const info = match[4].trim();
                        this.addResult(tags, filePath, lines, info);
                    }
                });
            }
        } catch (error) {
            console.error(`处理规则文件 ${ruleFile} 时出错:`, error);
            vscode.window.showErrorMessage(`处理规则文件 ${path.basename(ruleFile)} 时出错: ${error}`);
        }
    }

    addResult(tips: string[], path: string, lines: number[], info: string) {
        const result: CheckResult = { tips: this.getTips(tips), path: path, lines, info };
        let resultsMap = this.resultsMap;
        if (!resultsMap.has(path)) {
            resultsMap.set(path, []);
        }
        resultsMap.get(path)!.push(result);
    }

    clearResults() {
        this.resultsMap.clear();
    }

    getVirtualRoot(showAll: boolean, targets: Array<{path: string; isDir: boolean;}>) {
        const rootNodes = targets
            .filter(t => t.isDir)
            .map(t => this.getRoot(showAll, t.path, true));
        const fileNodes = targets
            .filter(t => !t.isDir)
            .map(t => this.getRoot(showAll, t.path, false));
        const showText = showAll ? "检查结果" : "错误检查结果";
        const virtualRoot = new DirectoryNode(showText, "");
        rootNodes.filter(n => n !== null).forEach(n => virtualRoot.children.set(n.name, n));
        fileNodes.filter(n => n !== null).forEach(n => virtualRoot.children.set(n.name, n));
        this.sortTree(virtualRoot);
        return virtualRoot;
    }

    getRoot(showAll: boolean, path: string, isDir: boolean) {
        let resultsMap = this.resultsMap;
        if (isDir) {
            const allFiles = showAll ? this.getAllLuaFiles(path) : Array.from(resultsMap.keys());
            let rootNode = null;
            let node = this.buildFileSystemTree(path, allFiles, resultsMap);
            if (node.children.size === 0) {
                rootNode = null;
            } else {
                rootNode = node;
            }
            return rootNode;
        } else {
            let rootNode = null;
            if (showAll || resultsMap.has(path)) {
                this.buildFileNode(path, resultsMap);
            }
            return rootNode;
        }
    }

    getAllLuaFiles(dir: string): string[] {
        const files: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...this.getAllLuaFiles(fullPath));
            } else if (entry.isFile() && path.extname(entry.name) === '.lua') {
                files.push(fullPath);
            }
        }
        return files;
    }

    buildFileSystemTree(dir: string, filePaths: string[], resultsMap: Map<string, CheckResult[]>): DirectoryNode {
        const root = new DirectoryNode(path.basename(dir), dir);
        filePaths.forEach(filePath => {
            const relativePath = path.relative(dir, filePath);
            if (relativePath.startsWith('..')) {
                return;
            }
            const parts = relativePath.split(path.sep);
            let currentNode = root;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === parts.length - 1) {
                    const fileNode = new FileNode(part, filePath);
                    fileNode.results = resultsMap.get(filePath) || [];
                    currentNode.children.set(part, fileNode);
                } else {
                    let child = currentNode.children.get(part);
                    if (!child || !(child instanceof DirectoryNode)) {
                        child = new DirectoryNode(part, path.join(currentNode.path, part));
                        currentNode.children.set(part, child);
                    }
                    currentNode = child as DirectoryNode;
                }
            }
        });
        return root;
    }

    buildFileNode(filePath: string, resultsMap: Map<string, CheckResult[]>) {
        const fileNode = new FileNode(path.basename(filePath), filePath);
        fileNode.results = resultsMap.get(filePath) || [];
        return fileNode;
    }

    private sortTree(node: DirectoryNode) {
        const children = Array.from(node.children.entries());
        const dirs = children.filter(([_, child]) => child instanceof DirectoryNode);
        const files = children.filter(([_, child]) => child instanceof FileNode);

        dirs.sort((a, b) => a[0].localeCompare(b[0]));
        files.sort((a, b) => a[0].localeCompare(b[0]));

        node.children.clear();
        dirs.forEach(([name, child]) => node.children.set(name, child));
        files.forEach(([name, child]) => node.children.set(name, child));

        dirs.forEach(([_, child]) => {
            if (child instanceof DirectoryNode) {
                this.sortTree(child);
            }
        });
    }

    getEncoding(buffer: Buffer): string | null {
        const encoding = chardet.detect(buffer) || 'gbk';
        // // UTF-8检测（EF BB BF）
        // if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        //     return 'utf8';
        // }
        // // UTF-16 LE检测（FF FE）
        // if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        //     return 'utf16le';
        // }
        // // UTF-16 BE检测（FE FF）
        // if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
        //     return 'utf16be';
        // }
        // // 其他编码检测逻辑...
        // return 'gbk';
        return encoding;
    }

    getTips(tips: string[]): string {
        if (tips.some(tip => tip.includes("提示"))) {
            return "warning";
        }
        return "error";
    }
}