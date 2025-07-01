import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import { Deque } from '@datastructures-js/deque';
import { Trie } from '../function/trie'
import {ContextOption, ContextTreeNode, ContextItem} from '../ai_model/base/ai_types'
import {ContextBase} from './base/context_base';
import type {IdentifierType} from './base/context_base';
import { getFileContent } from '../function/base_function';
import { LuaContext } from './lua/lua_context';
import type { DependencyGraphType, DefinitionMapType, ScopeNode } from './lua/lua_context';
import { Scope } from '../types/scope'
import { SegmentTree } from '../function/segment_tree';
import { range } from 'lodash';

export class ContextMgr extends ContextBase {
    private filters = ['js', 'ts', 'py', 'lua', 'c', 'cc', 'h', 'hpp', 'cpp'];
    private folderBlackList = ['node_modules', 'build', '.git', '.vscode'];
    private luaContext: LuaContext;

    constructor(private extensionName: string) {
        super();
        this.luaContext = new LuaContext();
    }

    public getRelevantContext(startPos: number, content: string, filePath: string): ContextOption[] {
        const result: ContextOption[] = [];
        const itemMap = this.getRelatedContext(startPos, content, filePath);
        for (const [key, items] of itemMap) {
            for (const item of items) {
                item.paths = [key];
                const option = this.ContextItemToOption(item);
                result.push(option);
            }
        }
        return result;
    }

    public getContext(context: ContextOption[]): string {
        let result = "以下是上下文引用:\n";
        let uniqueContextIds = new Set<string>();
        let parts = {
            function: [],
            file: []
        };
        for (const item of context) {
            this.processContext(parts, uniqueContextIds, item);
        }
        if (parts.function.length > 0) {
            result += "\n函数引用:\n";
            result += parts.function.join("\n") + "\n";
        }
        if (parts.file.length > 0) {
            result += "\n文件引用:\n";
            result += parts.file.join("\n") + "\n";
        }
        return result;
    }

    private processContext(parts: any, uniqueContextIds: Set<string>, option: any) {
        const ref = option.contextItem;
        if (ref) {
            switch (ref.type) {
                case 'file':
                case 'folder':
                    if (ref.paths) {
                        for (const filePath of ref.paths) {
                            if (uniqueContextIds.has(filePath)) {
                                continue;
                            }
                            uniqueContextIds.add(filePath);
                            try {
                                if (fs.existsSync(filePath)) {
                                    const content = getFileContent(filePath);
                                    parts['file'].push(filePath + ":\n" + content + "\n");
                                }
                            } catch (error) {
                                console.error(`Error reading file: ${filePath}`, error);
                            }
                        }
                    }
                    break;
                default:
                    if (uniqueContextIds.has(ref.name)) {
                        break;
                    }
                    uniqueContextIds.add(ref.name);
                    parts[ref.type].push(ref.content);
                    break;
            }
        }
        if (option.children) {
            for (const child of option.children) {
                this.processContext(parts, uniqueContextIds, child);
            }
        }
    }

    public getOptions(data: object | undefined): ContextOption[] {
        let options = this.getOptionsFromFile();
        options.forEach(option => {
            if (option.type == 'code') {
                option.children = this.getCodeReferenceOptions(data);
                if (option.children && option.children.length == 0) {
                    option.children = undefined;
                }
            }
        })
        return options;
    }

    async selectFiles(onlyFiles: boolean): Promise<ContextOption> {
        const optionType = onlyFiles ? 'files' : 'folders';
        let result: ContextOption = { 
            type: optionType, 
            id: optionType, 
            name: optionType, 
            describe: '上下文文件列表',
            contextItem: { type: optionType, name: optionType, paths: [] }
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
                if (result.contextItem) {
                    result.contextItem.paths = pathList;
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`文件选择失败: ${error as string}`);
        }
        return result;
    }

    async selectWorkspace(): Promise<ContextOption> {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        const workspacePath = workspace?.uri;
        const optionType = 'workspace';
        let result: ContextOption = { 
            type: optionType, 
            id: optionType, 
            name: optionType, 
            describe: '工作区文件列表',
            contextItem: { type: optionType, name: optionType, paths: [] }
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
            if (result.contextItem) {
                result.contextItem.paths = pathList;
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

    getOptionsFromFile():  ContextOption[] {
        try {
            const configPath = path.join(path.dirname(path.dirname(__dirname)), '../../assets/config/reference_config.json');
            const rawConfig = fs.readFileSync(configPath, 'utf-8');
            if (rawConfig) {
                const obj = JSON.parse(rawConfig);
                return obj["options"] as ContextOption[];
            } else {
                return [];
            }
        } catch (error) {
            console.error('加载引用配置失败:', error);
            return [];
        }
    }

    getCodeReferenceOptions(data: object | undefined): ContextOption[] | undefined {
        if (!vscode.window.activeTextEditor) {
            return undefined;
        }
        const types: IdentifierType[] = ['function'];
        const uri = vscode.window.activeTextEditor.document.uri;
        const filePath = uri.fsPath;
        const ext = path.extname(filePath).toLowerCase().substring(1);
        const parser = this.languageParsers[ext] || (() => []);
        try {
            const content = getFileContent(filePath);
            const parsedData = parser(content, types, 0);
            const functionMap = new Map<string, ContextOption>();
            const contextOptions: ContextOption[] = [];
            this.ContextItemToOptions(contextOptions, parsedData.tree);
            contextOptions.forEach(item => {
                functionMap.set(item.id, item);
            });

            return Array.from(functionMap.values());
        } catch (error) {
            console.error(`解析 ${ext} 文件失败:`, error);
            return [];
        }
    }

    // parseVue(content: string): ContextOption[] {
    //     const ast = require('vue-template-compiler').parseComponent(content);
    //     const functions: ContextOption[] = [];

    //     ast.script?.content && require('acorn').parse(ast.script.content, {
    //         ecmaVersion: 2020,
    //         sourceType: 'module'
    //     }).children.forEach((node: any) => {
    //         if (node.type === 'FunctionDeclaration') {
    //             functions.push({
    //                 type: 'function',
    //                 id: node.name,
    //                 name: node.name,
    //                 describe: `Vue方法: ${node.name}`
    //             });
    //         }
    //     });

    //     return functions;
    // }

    protected getRelatedContext(startPos: number, text: string, filePath: string): Map<string, ContextItem[]> {
        const result: Map<string, ContextItem[]> = new Map();
        const identifiers = this.getIdentifiers(0, filePath, undefined);
        if (!identifiers) {
            return result;
        }
        const keywordTree: ContextTreeNode = {
            value: {
                type: 'global',
                name: 'global',
                range: {
                    start: 0,
                    end: identifiers.content.length
                }
            },
            children: []
        };
        const rootScope = new Scope('global', undefined);
        const rootScopes = new Map();
        rootScopes.set('global', rootScope);
        const scopeNode: ScopeNode = {
            stack: [rootScopes],
            current: rootScope,
            currentDepth: 0
        };
        this.luaContext.buildTree(keywordTree, scopeNode, identifiers.ast, identifiers.content, 0);
        const rangeTree = new SegmentTree(0, identifiers.content.length);
        rangeTree.update(startPos, startPos + text.length, 1);
        const items: ContextItem[] = [];
        this.getIdentifiersByRange(items, keywordTree, startPos, startPos + text.length);
        const queue = new Deque<string>();
        for (const item of items) {
            queue.pushBack(item.name);
        }
        const visited = new Set<string>();
        const maxDepth = 3;

        this.findRelatedContext(queue, filePath, identifiers.ast, identifiers.content, result, visited, 0, maxDepth, rangeTree);
        return result;
    }

    protected findRelatedContext(queue: Deque<string>,
        filePath: string,
        ast: any,
        content: string,
        result: Map<string, ContextItem[]>,
        visited: Set<string>,
        depth: number,
        maxDepth = 3,
        rangeTree: SegmentTree
    ) {
        const dependencyGraph: DependencyGraphType = new Map();
        const definitionMap: DefinitionMapType = new Map();
        const rootScope = new Scope('global', undefined);
        const rootScopes = new Map();
        rootScopes.set('global', rootScope);
        const scopeNode: ScopeNode = {
            stack: [rootScopes],
            current: rootScope,
            currentDepth: 0
        };
        this.luaContext.buildDependencyGraph(definitionMap, dependencyGraph, scopeNode, ast, content, 0);
        const visitedIdentifiers = new Set<string>();
        const missQueue = new Deque<string>();
        if (!result.has(filePath)) {
            result.set(filePath, []);
        }
        while (!queue.isEmpty()) {
            const current = queue.popFront();
            const definedNode = definitionMap.get(current);
            if (definedNode) {
                const key = `${filePath}:${current}`;
                if (visited.has(key)) {
                    continue;
                }
                visited.add(key);
                if (visitedIdentifiers.has(definedNode.name)) {
                    continue;
                }
                visitedIdentifiers.add(definedNode.name);
                if (!definedNode.range) {
                    continue;
                }
                rangeTree.update(definedNode.range.start, definedNode.range.end, 1);
                const dependencies = dependencyGraph.get(definedNode.name) || new Set();
                for (const dep of dependencies) {
                    if (visitedIdentifiers.has(dep)) {
                        continue;
                    }
                    queue.pushBack(dep);
                }
            } else {
                missQueue.pushBack(current);
            }
        }
        const posList = this.getPosList(content);
        this.createContextItemsByRange(result.get(filePath)!, rangeTree.getRange(0, content.length, 1), content, posList);
        if (!missQueue.isEmpty()) {
            const includes = this.extractIncludes(content, path.extname(filePath));
            for (const include of includes) {
                const includePath = this.resolveIncludePath(filePath, include);
                if (includePath && depth < maxDepth) {
                    const includeIdentifiers = this.getIdentifiers(0, includePath, undefined);
                    if (!includeIdentifiers) {
                        continue;
                    }
                    const currentRangeTree = new SegmentTree(0, includeIdentifiers.content.length);
                    this.findRelatedContext(missQueue, includePath, includeIdentifiers.ast, includeIdentifiers.content, result, visited, depth + 1, maxDepth, currentRangeTree);
                }
            }
        }
    }

    private createContextItemsByRange(result: ContextItem[], source: [number, number][], content: string, posList: number[]) {
        for (const item of source) {
            const current: ContextItem = {
                type: 'lua',
                name: 'souce code',
                content: content.substring(item[0], item[1]),
                range: {
                    start: item[0],
                    end: item[1],
                    startLine: this.getLineCount(posList, item[0]),
                    endLine: this.getLineCount(posList, item[1])
                }
            }
            result.push(current);
        }
    }

    private getPosList(content: string) {
        const items = content.split('\n');
        const result = [];
        let nowPos = 0;
        for (const item of items) {
            nowPos += item.length + 1;
            result.push(nowPos);
        }
        return result;
    }

    private getLineCount(posList: number[], pos: number) {
        let left = 0;
        let right = posList.length - 1
        let mid = 0;
        while (left < right) {
            mid = Math.floor((left + right) / 2);
            if (posList[mid] <= pos) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }
        return left + 1;
    }
}