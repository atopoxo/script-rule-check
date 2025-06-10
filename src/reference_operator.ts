import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
const chardet = require('chardet');
import * as iconv from 'iconv-lite';
import {ReferenceOption, ReferenceInfo} from './output_format'

type Parser = (content: string) => ReferenceOption[];

interface FunctionNode {
    name: string;
    type: 'FunctionDeclaration' | 'CallExpression';
}

interface ParsedData {
    functions: FunctionNode[];
    calls: FunctionNode[];
}

export class ReferenceOperator {
    private languageParsers: {[key: string]: Parser} = {
        lua: (content) => this.parseLua(content),
        py: (content) => this.parsePython(content),
        js: (content) => this.parseJsTs(content),
        ts: (content) => this.parseJsTs(content),
        c: (content) => this.parseCpp(content),
        cc: (content) => this.parseCpp(content),
        h: (content) => this.parseCpp(content),
        hpp: (content) => this.parseCpp(content),
        cpp: (content) => this.parseCpp(content),
        vue: (content) => this.parseVue(content)
    };
    private filters = ['js', 'ts', 'py', 'lua', 'vue', 'c', 'cc', 'h', 'hpp', 'cpp'];
    private folderBlackList = ['node_modules', 'build', '.git', '.vscode'];

    constructor(private extensionName: string) {
    }

    getOptions(data: object | undefined): ReferenceOption[] {
        let options = this.getOptionsFromFile();
        options.forEach(option => {
            if (option.type == 'code') {
                option.children = this.getCodeReferenceOptions(data)
            }
        })
        return options;
    }

    async selectFiles(onlyFiles: boolean): Promise<ReferenceOption> {
        const optionType = onlyFiles ? 'files' : 'folders';
        let result: ReferenceOption = { 
            type: optionType, 
            id: optionType, 
            name: optionType, 
            describe: '上下文文件列表',
            reference: { type: optionType, name: optionType, paths: [] }
        };
        const options: vscode.OpenDialogOptions = {
            canSelectMany: true,
            canSelectFolders: !onlyFiles,
            canSelectFiles: onlyFiles,
            openLabel: '选择文件',
            filters: {
                '代码文件': this.filters,
                '所有文件': ['*']
            }
        };
        try {
            const files = await vscode.window.showOpenDialog(options);
            if (files && files.length > 0) {
                const allPaths = await this.processSelectedPaths(files, this.filters, this.folderBlackList);
                const pathList = allPaths.map(filePath => {
                    return filePath;
                });
                if (result.reference) {
                    result.reference.paths = pathList;
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`文件选择失败: ${error as string}`);
        }
        return result;
    }

    async selectWorkspace(): Promise<ReferenceOption> {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        const workspacePath = workspace?.uri;
        const optionType = 'workspace';
        let result: ReferenceOption = { 
            type: optionType, 
            id: optionType, 
            name: optionType, 
            describe: '工作区文件列表',
            reference: { type: optionType, name: optionType, paths: [] }
        };
        if (!workspacePath) {
            return Promise.resolve(result);
        }
        try {
            const dirs = [workspacePath];
            const allPaths = await this.processSelectedPaths(dirs, this.filters, this.folderBlackList);
            const pathList = allPaths.map(filePath => {
                return filePath;
            });
            if (result.reference) {
                result.reference.paths = pathList;
            }
        } catch (error) {
            console.error(error);
        }
        return result;
    }

    async processSelectedPaths(uris: vscode.Uri[], filters: string[] = [], folderBlackList: string[]): Promise<string[]> {
        const allFiles: string[] = [];
        for (const uri of uris) {
            if (await this.isDirectory(uri)) {
                const files = await this.readDirectory(uri, filters, folderBlackList);
                allFiles.push(...files);
            } else {
                const filePath = uri.fsPath;
                const ext = path.extname(filePath).toLowerCase().substring(1);
                if (filters.length === 0 || filters.includes(ext)) {
                    allFiles.push(filePath);
                }
            }
        }
        
        return allFiles;
    };

    private async isDirectory(uri: vscode.Uri): Promise<boolean> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            return stat.type === vscode.FileType.Directory;
        } catch {
            return false;
        }
    }

    private async readDirectory(dirUri: vscode.Uri, filters: string[] = [], folderBlackList: string[] = []): Promise<string[]> {
        try {
            const allFiles: string[] = [];
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            for (const [name, type] of entries) {
                const fullPath = vscode.Uri.joinPath(dirUri, name);
                const isHidden = name.startsWith('.');
                if (isHidden) {
                    continue;
                }
                if (type === vscode.FileType.Directory) {
                    const dirName = name.toLowerCase();
                    if (folderBlackList.includes(dirName)) {
                        continue;
                    }
                    const subFiles = await this.readDirectory(fullPath, filters, folderBlackList);
                    allFiles.push(...subFiles);
                } else {
                    const filePath = fullPath.fsPath;
                    const ext = path.extname(filePath).toLowerCase().substring(1);
                    if (filters.length === 0 || filters.includes(ext)) {
                        allFiles.push(filePath);
                    }
                }
            }
            return allFiles;
        } catch (error) {
            console.error(`读取目录失败: ${dirUri.fsPath}`, error);
            throw new Error(`无法读取目录: ${dirUri.fsPath}`);
        }
    }

    getOptionsFromFile():  ReferenceOption[] {
        try {
            const configPath = path.join(__dirname, '../../assets/config/reference_config.json');
            const rawConfig = fs.readFileSync(configPath, 'utf-8');
            if (rawConfig) {
                const obj = JSON.parse(rawConfig);
                return obj["options"] as ReferenceOption[];
            } else {
                return [];
            }
        } catch (error) {
            console.error('加载引用配置失败:', error);
            return [];
        }
    }

    getCodeReferenceOptions(data: object | undefined): ReferenceOption[] | undefined {
        if (!vscode.window.activeTextEditor) {
            return undefined;
        }
        const uri = vscode.window.activeTextEditor.document.uri;
        const filePath = uri.fsPath;
        const ext = path.extname(filePath).toLowerCase().substring(1);
        const parser = this.languageParsers[ext] || (() => []);
        try {
            const buffer = fs.readFileSync(filePath);
            const encoding: BufferEncoding = this.getEncoding(buffer);
            const content = iconv.decode(buffer, encoding);
            const parsedData = parser(content);
            const functionMap = new Map<string, ReferenceOption>();

            parsedData.forEach(item => {
                functionMap.set(item.id, item);
            });

            return Array.from(functionMap.values());
        } catch (error) {
            console.error(`解析 ${ext} 文件失败:`, error);
            return [];
        }
    }

    parseLua(content: string): ReferenceOption[] {
        const ast = require('luaparse').parse(content, {locations: true, ranges: true});
        const functions: ReferenceOption[] = [];

        ast.body.forEach((node: any) => {
            if (node.type === 'FunctionDeclaration' || (node.type === 'LocalStatement' && node.init?.[0]?.type === 'FunctionExpression')) {
                let functionName = '';
                if (node.type === 'FunctionDeclaration') {
                    functionName = this.getLuaFunctionName(node.identifier);
                } else if (node.type === 'LocalStatement') {
                    functionName = node.variables[0].name;
                }
                const funcBody = node.type === 'FunctionDeclaration' ? node : node.init[0];
                const functionContent = content.substring(funcBody.range[0], funcBody.range[1]);
                const lineStart = funcBody.loc.start.line;
                const lineEnd = funcBody.loc.end.line;
                functions.push({
                    type: 'function',
                    id: functionName,
                    name: functionName,
                    describe: `Lua函数: ${functionName}`,
                    reference: { type: 'function', name: functionName, content: functionContent, range: {start:lineStart, end:lineEnd} }
                });
            } else if (node.type === 'CallExpression') {
                if (node.callee.type === 'Identifier') {
                    functions.push({
                        type: 'call',
                        id: node.callee.name,
                        name: node.callee.name,
                        describe: `调用函数: ${node.callee.name}`
                    });
                }
            }
        });

        return functions;
    }

    getLuaFunctionName(identifier: any): string {
        if (identifier.type === 'Identifier') {
            return identifier.name;
        } else if (identifier.type === 'MemberExpression') {
            return `${this.getLuaFunctionName(identifier.base)}.${this.getLuaFunctionName(identifier.identifier)}`;
        } else {
            return '';
        }
    }

    parsePython(content: string): ReferenceOption[] {
        const ast = require('acorn').parse(content, { ecmaVersion: 2020 });
        const functions: ReferenceOption[] = [];

        require('acorn-walk').simple(ast, {
            FunctionDef(node: any) {
                functions.push({
                    type: 'function',
                    id: node.name,
                    name: node.name,
                    describe: `Python函数: ${node.name}`
                });
            },
            Call(node: any) {
                if (node.callee.type === 'Name') {
                    functions.push({
                        type: 'call',
                        id: node.callee.name,
                        name: node.callee.name,
                        describe: `调用函数: ${node.callee.name}`
                    });
                }
            }
        });

        return functions;
    }

    parseJsTs(content: string): ReferenceOption[] {
        const ast = require('esprima').parseScript(content, { range: true });
        const functions: ReferenceOption[] = [];

        require('estraverse').traverse(ast, {
            enter(node: any) {
                if (node.type === 'FunctionDeclaration') {
                    functions.push({
                        type: 'function',
                        id: node.id.name,
                        name: node.id.name,
                        describe: `JS/TS函数: ${node.id.name}`,
                        reference: {
                            type: 'function',
                            name: node.id.name,
                            content: content.substring(node.range[0], node.range[1]),
                            range: { start: node.range[0] + 1, end: node.range[1] + 1 }
                        }
                    });
                } else if (node.type === 'CallExpression') {
                    if (node.callee.type === 'Identifier') {
                        functions.push({
                            type: 'call',
                            id: node.callee.name,
                            name: node.callee.name,
                            describe: `调用函数: ${node.callee.name}`
                        });
                    }
                }
            }
        });

        return functions;
    }

    parseCpp(content: string): ReferenceOption[] {
        const lines = content.split('\n');
        const functions: ReferenceOption[] = [];

        lines.forEach((line, index) => {
            const funcDef = line.match(/(\w+)\s+(\w+)\s*$.*$\s*{?/);
            const funcCall = line.match(/(\w+)\s*\(/g);

            if (funcDef) {
                functions.push({
                    type: 'function',
                    id: funcDef[2],
                    name: funcDef[2],
                    describe: `C/C++函数: ${funcDef[2]}`
                });
            }

            if (funcCall) {
                funcCall.forEach((match: string) => {
                    const name = match.replace(/\s*\(/, '');
                    functions.push({
                        type: 'call',
                        id: name,
                        name: name,
                        describe: `调用函数: ${name}`
                    });
                });
            }
        });

        return functions;
    }

    parseVue(content: string): ReferenceOption[] {
        const ast = require('vue-template-compiler').parseComponent(content);
        const functions: ReferenceOption[] = [];

        ast.script?.content && require('acorn').parse(ast.script.content, {
            ecmaVersion: 2020,
            sourceType: 'module'
        }).children.forEach((node: any) => {
            if (node.type === 'FunctionDeclaration') {
                functions.push({
                    type: 'function',
                    id: node.name,
                    name: node.name,
                    describe: `Vue方法: ${node.name}`
                });
            }
        });

        return functions;
    }

    getEncoding(buffer: Buffer): BufferEncoding {
        const encoding = chardet.detect(buffer) || 'gbk';
        return encoding;
    }
}