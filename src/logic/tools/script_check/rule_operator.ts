import * as path from 'path';
import * as fs from 'fs';
const iconv = require('iconv-lite');
import * as vscode from 'vscode';
import { exec } from 'child_process';
import {CheckRule, CheckResult, FileNode, DirectoryNode, DirectoryTreeItem, FileTreeItem, CheckResultTreeItem} from '../../../output_format';

export class RuleOperator {
    private pathToCheckList = new Map<string, CheckResult[]>();
    private clientPath: string;

    constructor(rootPath: string) {
        this.clientPath = path.join(rootPath, 'client').replace(/\\/g, '/');
    }
    public getIssueCount(): number {
        return this.pathToCheckList.size;
    }

    public getScriptCheckRules(toolDir: string, ruleDir: string): CheckRule[] {
        const tag = "rule";
        let count = 0;
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
                            id: `${tag}${++count}`,
                            taskName: taskName.trim(),
                            taskPath: path.join(ruleDir, taskPath.trim()),
                            isChecked: isChecked.trim() === '1' // 假设1表示true，0表示false
                        };
                    })
                    .map(item => {
                        return new CheckRule(item.id, item.taskName, item.taskPath);
                    })
                    .filter(item => {
                        const ext = path.extname(item.taskPath).toLowerCase();
                        return ext === '.lua' || ext === '.py';
                    });
            } catch (error) {
                console.error('读取CaseInfo.tab文件失败:', error);
                return [];
            }
        })();
        return ruleFiles;
    }

    public async processRuleFile(rule: CheckRule, logDir: string, luaExe: string, pythonExe: string, luaParams: string, checkPath: string, productDir: string, cwd: string) {
        const ruleFile = rule.taskPath;
        const ext = path.extname(ruleFile);
        const logPath = path.join(logDir, path.basename(ruleFile, ext) + '.log');
        const command = ext === '.lua' ? 
            `${luaExe} -e "${luaParams}" "${ruleFile}" "${logPath}" "${checkPath}" "${productDir}"` : 
            `${pythonExe} "${ruleFile}" "${logPath}" "${checkPath}" "${productDir}"`;
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
                    const startCharPos = trimmed.indexOf('[') + 1;
                    const endCharPos = trimmed.indexOf(']');
                    if (startCharPos === -1 || endCharPos === -1) {
                        return;
                    }
                    
                    const tag = trimmed.slice(startCharPos, endCharPos).trim();
                    let jsonPart = trimmed.slice(endCharPos + 1).trim();
                    // const match = trimmed.match(/^((?:\[[^\]]+\]\s*)+)\s+(.*?)\s+文件中，第\s+(\d+(?:,\d+)*), ?\s+行,(.*)$/);
                    if (jsonPart) {
                        const tags = [tag];
                        let jsonObj = null;
                        try {
                            jsonPart = jsonPart.replace(/\\/g, '/');
                            jsonPart = jsonPart.replace(/\/\//g, '/');
                            jsonPart = jsonPart.replace(/\t/g, ''); 
                            jsonObj = JSON.parse(jsonPart);
                        } catch (error) {
                            console.error(`无法解析日志行: ${trimmed}`);
                            return;
                        }
                        if (typeof jsonObj["lines"] !== "string") {
                            console.error(`无法解析日志行: ${trimmed}`);
                            return;
                        }
                        const filePath = jsonObj["path"];
                        const lines = jsonObj["lines"].split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n));
                        const info = jsonObj["detail"].trim();
                        if (filePath && filePath !== '') {
                            this.addResult(rule, tags, filePath, lines, info);
                        }
                    } else {
                        console.error(`无法解析日志行: ${trimmed}`);
                    }
                });
            }
        } catch (error) {
            console.error(`处理规则文件 ${ruleFile} 时出错:`, error);
            vscode.window.showErrorMessage(`处理规则文件 ${path.basename(ruleFile)} 时出错: ${error}`);
        }
    }

    public addResult(rule: CheckRule, tips: string[], path: string, lines: number[], info: string) {
        const result: CheckResult = { rule: rule, tips: this.getTips(tips), path: path, lines, info };
        let pathToCheckList = this.pathToCheckList;
        if (!pathToCheckList.has(path)) {
            pathToCheckList.set(path, []);
        }
        pathToCheckList.get(path)!.push(result);
    }

    public clearResults() {
        this.pathToCheckList.clear();
    }

    public getVirtualRoot(showAll: boolean, targets: Array<{path: string; isDir: boolean;}>) {
        const showText = showAll ? "检查结果" : "错误检查结果";
        const virtualRoot = new DirectoryNode(showText, "");

        const rootNodes = targets
            .filter(t => t.isDir)
            .map(t => this.getRoot(showAll, t.path, true));
        const fileNodes = targets
            .filter(t => !t.isDir)
            .map(t => this.getRoot(showAll, t.path, false));
        rootNodes.filter(n => n !== null).forEach(n => virtualRoot.children.set(n.name, n));
        fileNodes.filter(n => n !== null).forEach(n => virtualRoot.children.set(n.name, n));
        this.sortTree(virtualRoot);
        return virtualRoot;
    }

    private getRoot(showAll: boolean, path: string, isDir: boolean) {
        let pathToCheckList = this.pathToCheckList;
        if (isDir) {
            const allFiles = showAll ? this.getAllLuaFiles(path) : Array.from(pathToCheckList.keys());
            let rootNode = null;
            let node = this.buildFileSystemTree(path, allFiles, pathToCheckList);
            if (node.children.size === 0) {
                rootNode = null;
            } else {
                rootNode = node;
            }
            return rootNode;
        } else {
            let rootNode = null;
            const finalPath = path.replace(/\\/g, '/');
            if (showAll || pathToCheckList.has(finalPath)) {
                rootNode = this.buildFileNode(finalPath, pathToCheckList);
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
                const finalPath = fullPath.replace(/\\/g, '/');
                files.push(finalPath);
            }
        }
        return files;
    }

    buildFileSystemTree(dir: string, filePaths: string[], pathToCheckList: Map<string, CheckResult[]>): DirectoryNode {
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
                    const fileNode = this.buildFileNode(filePath, pathToCheckList);
                    currentNode.children.set(part, fileNode);
                } else {
                    let child = currentNode.children.get(part);
                    if (!child || !(child instanceof DirectoryNode)) {
                        let currentPath = path.join(currentNode.path, part);
                        currentPath = currentPath.replace(/\\/g, '/');
                        child = new DirectoryNode(part, currentPath);
                        currentNode.children.set(part, child);
                    }
                    currentNode = child as DirectoryNode;
                }
            }
        });
        return root;
    }

    private buildFileNode(filePath: string, pathToCheckList: Map<string, CheckResult[]>) {
        let relativePath = path.relative(this.clientPath, filePath);
        relativePath = relativePath.replace(/\\/g, '/');
        const fileNode = new FileNode(relativePath, filePath);
        fileNode.results = pathToCheckList.get(filePath) || [];
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

    getTips(tips: string[]): string {
        if (tips.some(tip => tip.includes("提示"))) {
            return "warning";
        }
        return "error";
    }
}