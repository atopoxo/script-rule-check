import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import { Trie } from '../../function/trie'
import {ContextOption, ContextItem, ContextTreeNode} from '../../ai_model/base/ai_types'
import { getFileContent } from '../../function/base_function';

interface ContextNode {
    ast: any;
    tree: ContextTreeNode;
    content: string;
}

export type IdentifierType = 'function' | 'variable' | 'closure' | 'constant';
type Parser = (content: string, types: IdentifierType[], startPos: number) => ContextNode;

export class ContextBase {
    protected languageParsers: {[key: string]: Parser} = {
        lua: (content, types, startPos) => this.parseLua(content, types, startPos),
        py: (content, types, startPos) => this.parsePython(content, types, startPos),
        js: (content, types, startPos) => this.parseJsTs(content, types, startPos),
        ts: (content, types, startPos) => this.parseJsTs(content, types, startPos),
        c: (content, types, startPos) => this.parseCpp(content, types, startPos),
        cc: (content, types, startPos) => this.parseCpp(content, types, startPos),
        h: (content, types, startPos) => this.parseCpp(content, types, startPos),
        hpp: (content, types, startPos) => this.parseCpp(content, types, startPos),
        cpp: (content, types, startPos) => this.parseCpp(content, types, startPos)
    };
    private luaPropertyFilters = new Set();

    constructor() {
        this.initLuaPropertyFilters();
    }

    private initLuaPropertyFilters() {
        const filters = ['type', 'range', 'loc', 'base', 'identifier'];
        filters.forEach(filter => this.luaPropertyFilters.add(filter));
    }

    protected getIdentifiers(startPos: number, filePath: string, content?: string): ContextNode | undefined {
        try {
            const ext = path.extname(filePath).toLowerCase().substring(1);
            const parser = this.languageParsers[ext];
            if (!parser) {
                return undefined;
            }
            if (!content) {
                content = getFileContent(filePath);
                content = content.replace(/\r\n/g, '\n');
            }
            const types: IdentifierType[] = ['function', 'variable', 'closure', 'constant'];
            const result = parser(content, types, startPos);
            
            return result;
        } catch (error) {
            console.error(`解析文件失败: ${filePath}`, error);
            return undefined;
        }
    }

    protected getIdentifiersByRange(result: ContextItem[], current: ContextTreeNode, startPos: number, endPos: number) {
        if (!current.value) {
            return;
        }
        const currentNode = current.value;
        if (!currentNode.range) {
            return;
        }
        if (!(currentNode.range.start <= startPos && endPos <= currentNode.range.end)) {
            return;
        }
        if (currentNode.range.start == startPos && endPos == currentNode.range.end) {
            result.push(currentNode);
        }
        for (const child of current.children) {
            if (!child.value) {
                continue;
            }
            const childNode = child.value;
            if (!childNode.range) {
                continue;
            }
            if (childNode.range.end <= startPos) {
                continue;
            }
            if (childNode.range.start >= endPos) {
                break;
            }
            const leftPos = Math.max(startPos, childNode.range.start);
            const rightPos = Math.min(endPos, childNode.range.end);
            this.getIdentifiersByRange(result, child, leftPos, rightPos);
        }
    }

    protected traverseTree(result: Map<string, ContextTreeNode>, current: ContextTreeNode) {
        const value = current.value;
        if (value) {
            result.set(value.name, current);
        }
        const children = current.children;
        for (const child of children) {
            this.traverseTree(result, child);
        }
    }

    protected tree2Trie(result: Trie<ContextTreeNode>, current: ContextTreeNode) {
        const value = current.value;
        if (value) {
            result.insert(value.name, current);
        }
        const children = current.children;
        for (const child of children) {
            this.tree2Trie(result, child);
        }
    }

    protected extractIncludes(content: string, ext: string): string[] {
        const includes: string[] = [];
        let regex: RegExp;
        
        switch (ext) {
            case '.c':
            case '.cpp':
            case '.h':
            case '.hpp':
                regex = /#include\s+["<]([^">]+)[">]/g;
                break;
            case '.lua':
                regex = /(?:require|Include)\s*\(?['"]([^'"]+)['"]\)?/g;
                break;
            case '.py':
                regex = /import\s+([^\s#]+)|from\s+([^\s#]+)\s+import/g;
                break;
            case '.js':
            case '.ts':
                regex = /import\s+.*['"]([^'"]+)['"]|require\s*\(['"]([^'"]+)['"]\)/g;
                break;
            default:
                return [];
        }
        
        const matches = content.matchAll(regex);
        for (const match of matches) {
            // 对于可能有多个捕获组的正则，找到第一个非空匹配
            for (let i = 1; i < match.length; i++) {
                if (match[i]) {
                    includes.push(match[i]);
                    break;
                }
            }
        }
        
        return includes;
    }

    protected resolveIncludePath(currentPath: string, include: string): string | null {
        const currentDir = path.dirname(currentPath);
        const commonPath = this.findCommonPath(currentDir, include);
        
        if (commonPath) {
            const relativePath = path.relative(commonPath, currentDir);
            const basePath = path.dirname(commonPath);
            const fullPath = path.join(basePath, include);
            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
            return this.tryExtensions(fullPath);
        }
        return this.tryOtherResolutions(currentDir, include);
    }

    private findCommonPath(path1: string, path2: string): string | null {
        const parts1 = path.resolve(path1).split(path.sep);
        const parts2 = path2.split(/[\\/]/);
        const len = Math.min(parts1.length, parts2.length);
        let commonParts: string[] = [];
        
        for (let i = 0, j = 0; i < parts1.length && j < parts2.length;) {
            if (parts1[i] === parts2[j]) {
                commonParts.push(parts1[i]);
                i++;
                j++;
            } else {
                i++;
            }
        }
        
        return commonParts.length > 0 ? commonParts.join(path.sep) : null;
    }

    private tryOtherResolutions(currentDir: string, include: string): string | null {
        const relativePath = path.resolve(currentDir, include);
        if (fs.existsSync(relativePath)) {
            return relativePath;
        }
        const withExt = this.tryExtensions(relativePath);
        if (withExt) {
            return withExt;
        }
        const workspaceRoot = this.getWorkspaceRoot(currentDir);
        if (workspaceRoot) {
            const rootPath = path.resolve(workspaceRoot, include);
            if (fs.existsSync(rootPath)) {
                return rootPath;
            }
            const libPath = path.resolve(workspaceRoot, 'lib', include);
            if (fs.existsSync(libPath)) {
                return libPath;
            }
        }
        const nodeModulesPath = this.findInNodeModules(currentDir, include);
        if (nodeModulesPath) {
            return nodeModulesPath;
        }
        
        return null;
    }

    private tryExtensions(fullPath: string): string | null {
        const extensions = ['.lua', '.js', '.ts', '.py', '.c', '.cpp', '.h', '.hpp', ''];
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
        for (const ext of extensions) {
            const withExt = fullPath + ext;
            if (fs.existsSync(withExt)) {
                return withExt;
            }
        }
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
            for (const ext of extensions) {
                const indexFile = path.join(fullPath, `index${ext}`);
                if (fs.existsSync(indexFile)) {
                    return indexFile;
                }
            }
        }
        
        return null;
    }

    private getWorkspaceRoot(currentPath: string): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return null;
        }
        for (const folder of workspaceFolders) {
            const folderPath = folder.uri.fsPath;
            if (currentPath.startsWith(folderPath)) {
                return folderPath;
            }
        }
        
        return workspaceFolders[0].uri.fsPath;
    }

    protected tryFindLuaFile(modulePath: string): string | null {
        if (fs.existsSync(modulePath)) {
            return modulePath;
        }
        const withLuaExt = `${modulePath}.lua`;
        if (fs.existsSync(withLuaExt)) {
            return withLuaExt;
        }
        if (fs.statSync(modulePath).isDirectory()) {
            const initPath = path.join(modulePath, 'init.lua');
            if (fs.existsSync(initPath)) {
                return initPath;
            }
        }
        
        return null;
    }

    protected findInNodeModules(startDir: string, moduleName: string): string | null {
        let currentDir = startDir;
        
        while (currentDir !== path.parse(currentDir).root) {
            const nodeModulesPath = path.join(currentDir, 'node_modules', moduleName);
            const packagePath = path.join(nodeModulesPath, 'package.json');
            if (fs.existsSync(packagePath)) {
                try {
                    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                    if (pkg.main) {
                        const mainPath = path.join(nodeModulesPath, pkg.main);
                        if (fs.existsSync(mainPath)) {
                            return mainPath;
                        }
                    }
                } catch (error) {
                    console.error(`读取package.json失败: ${packagePath}`, error);
                }
            }
            const moduleFiles = [
                `${moduleName}.js`,
                `${moduleName}.ts`,
                `${moduleName}/index.js`,
                `${moduleName}/index.ts`
            ];
            for (const file of moduleFiles) {
                const filePath = path.join(nodeModulesPath, file);
                if (fs.existsSync(filePath)) {
                    return filePath;
                }
            }
            currentDir = path.dirname(currentDir);
        }
        
        return null;
    }

    private extractIdentifiersWithRegex(content: string): {name: string, type: IdentifierType}[] {
        const identifiers = new Map<string, IdentifierType>();
    
        // 提取函数定义（全局和局部）
        const functionRegex = /(?:local\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
        let match;
        while ((match = functionRegex.exec(content)) !== null) {
            identifiers.set(match[1], 'function');
        }
        
        // 提取函数参数
        const functionParamRegex = /function\s+[^(]*\(([^)]*)\)/g;
        while ((match = functionParamRegex.exec(content)) !== null) {
            const params = match[1].split(',').map(p => p.trim());
            for (const param of params) {
                if (param) {
                    identifiers.set(param, 'variable');
                }
            }
        }
        
        // 提取局部变量声明
        const localVarRegex = /local\s+([a-zA-Z_][a-zA-Z0-9_]*(\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)/g;
        while ((match = localVarRegex.exec(content)) !== null) {
            const vars = match[1].split(',').map(v => v.trim());
            for (const v of vars) {
                identifiers.set(v, 'variable');
            }
        }
        
        // 提取for循环中的变量
        const forLoopRegex = /\bfor\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*,?\s*([a-zA-Z_][a-zA-Z0-9_]*)?\s+in\b/g;
        while ((match = forLoopRegex.exec(content)) !== null) {
            if (match[1]) identifiers.set(match[1], 'variable');
            if (match[2]) identifiers.set(match[2], 'variable');
        }
        
        // 提取闭包和函数赋值
        const closureRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*function\s*\(/g;
        while ((match = closureRegex.exec(content)) !== null) {
            identifiers.set(match[1], 'closure');
        }
        
        // 提取点号访问的对象属性（如 player.GetMapID）
        const dotAccessRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\.[a-zA-Z_][a-zA-Z0-9_]*/g;
        while ((match = dotAccessRegex.exec(content)) !== null) {
            identifiers.set(match[1], 'variable');
        }
        
        // 提取常量（全大写和下划线组成的标识符）
        const constantRegex = /\b([A-Z_][A-Z0-9_]+)\b/g;
        while ((match = constantRegex.exec(content)) !== null) {
            identifiers.set(match[1], 'variable');
        }
        
        return Array.from(identifiers, ([name, type]) => ({name, type}));
    }

    protected parseLua(content: string, types: IdentifierType[], startPos: number): ContextNode {
        const ast = require('luaparse').parse(content, {locations: true, ranges: true});
        const root: ContextTreeNode = {
            value: {
                type: '',
                name: '',
                content: '',
                range: {
                    start: startPos,
                    end: startPos + content.length,
                    startLine: 0,
                    endLine: 0
                }
            }, 
            children: []
        };
        this.traverseLua(ast, (root.value as ContextItem).name, types, root, content, startPos);
        return {
            ast: ast, 
            tree: root,
            content: content
        };
    }

    // protected parseLua(content: string, types: IdentifierType[]): ContextTreeNode {
    //     const Parser = require('tree-sitter');
    //     const parser = new Parser();
    //     const language = require('tree-sitter-lua');
    //     parser.setLanguage(language);
    //     const ast = parser.parse(content);
    //     const parent: ContextTreeNode = {value: undefined, children: []};
        
    //     this.traverseLua(ast.rootNode, types, result, content);

    //     return result;
    // }

    protected parsePython(content: string, types: IdentifierType[], startPos: number): ContextNode {
        const Parser = require('tree-sitter');
        const parser = new Parser();
        const language = require('tree-sitter-python');
        parser.setLanguage(language);
        const ast = parser.parse(content);
        const root: ContextTreeNode = {
            value: {
                type: '',
                name: '',
                content: '',
                range: {
                    start: startPos,
                    end: startPos + content.length,
                    startLine: 0,
                    endLine: 0
                }
            }, 
            children: []
        };
        
        this.traversePython(ast.rootNode, (root.value as ContextItem).name, types, root, content, startPos);
        return {
            ast: ast, 
            tree: root,
            content: content
        };
    }

    protected parseJsTs(content: string, types: IdentifierType[], startPos: number): ContextNode {
        const Parser = require('tree-sitter');
        const parser = new Parser();
        const JavaScript = require('tree-sitter-javascript');
        const TypeScript = require('tree-sitter-typescript');
        const isTypeScript = /\.tsx?$/.test(content) || /(^|\n)\s*@ts-/.test(content);
        const language = isTypeScript ? TypeScript.typescript : JavaScript;
        parser.setLanguage(language);
        const ast = parser.parse(content);
        const root: ContextTreeNode = {
            value: {
                type: '',
                name: '',
                content: '',
                range: {
                    start: startPos,
                    end: startPos + content.length,
                    startLine: 0,
                    endLine: 0
                }
            }, 
            children: []
        };
        
        this.traverseJavaScript(ast.rootNode, (root.value as ContextItem).name, types, root, content, startPos);
        return {
            ast: ast, 
            tree: root,
            content: content
        };
    }

    protected parseCpp(content: string, types: IdentifierType[], startPos: number): ContextNode {
        const Parser = require('tree-sitter');
        const parser = new Parser();
        const language = require('tree-sitter-cpp');
        parser.setLanguage(language);
        const ast = parser.parse(content);
        const root: ContextTreeNode = {
            value: {
                type: '',
                name: '',
                content: '',
                range: {
                    start: startPos,
                    end: startPos + content.length,
                    startLine: 0,
                    endLine: 0
                }
            }, 
            children: []
        };
        
        this.traverseCpp(ast.rootNode, (root.value as ContextItem).name, types, root, content, startPos);
        return {
            ast: ast, 
            tree: root,
            content: content
        };
    }

    // private traverseLua(node: any, parentName: string, types: IdentifierType[], content: string, functions: ContextOption[]) {
    //     if (node.type === 'function_definition') {
    //         const nameNode = this.getLuaFunctionName(node);
    //         const functionName = nameNode ? nameNode.text : 'anonymous';
            
    //         functions.push(this.createReferenceOption(node, content, node, functionName));
    //     } else if (node.type === 'local_function') {
    //         const nameNode = node.childForFieldName('name');
    //         if (nameNode) {
    //             functions.push(this.createReferenceOption(nameNode, content, node, nameNode.text));
    //         }
    //     } else if (node.type === 'field') {
    //         const keyNode = node.childForFieldName('key');
    //         const valueNode = node.childForFieldName('value');
            
    //         if (keyNode && valueNode && valueNode.type === 'function_definition') {
    //             let tableName = 'table';
    //             let parent = node.parent;
    //             while (parent) {
    //                 if (parent.type === 'table') {
    //                     const tableVar = this.findTableVariableName(parent);
    //                     if (tableVar) {
    //                         tableName = tableVar;
    //                         break;
    //                     }
    //                 }
    //                 parent = parent.parent;
    //             }
                
    //             const functionName = `${tableName}.${keyNode.text}`;
    //             functions.push(this.createReferenceOption(valueNode, content, valueNode, functionName));
    //         }
    //     }
    //     for (let i = 0; i < node.childCount; i++) {
    //         this.traverseLua(node.child(i), content, functions);
    //     }
    // }

    protected traverseLua(node: any, parentName: string, types: IdentifierType[], parent: ContextTreeNode | undefined, content: string, startPos: number) {
        let current: ContextTreeNode | undefined = undefined;
        switch (node.type) {
            case 'IfStatement':
                current = this.luaIfStatement(node, parentName, types, content, startPos);
                break;
            case 'LocalStatement':
                current = this.luaLocalStatement(node, parentName, types, content, startPos);
                break;
            case 'AssignmentStatement':
                current = this.luaAssignmentStatement(node, parentName, types, content, startPos);
                break;
            case 'ForNumericStatement':
            case 'ForGenericStatement':
                current = this.luaForLoopStatement(node, parentName, types, content, startPos);
                break;
            case 'CallExpression':
                current = this.luaCallExpression(node, parentName, types, content, startPos);
                break;
            case 'FunctionExpression':
                current = this.luaFunctionExpression(node, parentName, types, content, startPos);
                break;
            case 'IndexExpression':
                current = this.luaIndexExpression(node, parentName, types, content, startPos);
                break;
            case 'MemberExpression':
                current = this.luaMemberExpression(node, parentName, types, content, startPos);
                break;
            case 'FunctionDeclaration':
                current = this.luaFunctionDeclaration(node, parentName, types, content, startPos);
                break;
            case 'Identifier':
                current = this.luaIdentifier(node, parentName, types, content, startPos);
                break;
            case 'StringLiteral':
                current = this.luaStringLiteral(node, parentName, types, content, startPos);
                break;
        }
        let currentName = parentName;
        if (current) {
            parent?.children.push(current);
            currentName = current.value?.name as string;
        } else {
            current = parent;
        }
        
        for (const key in node) {
            if (this.luaPropertyFilters.has(key)) {
                continue;
            }
            if (node.hasOwnProperty(key) && typeof node[key] === 'object') {
                if (Array.isArray(node[key])) {
                    for (const child of node[key]) {
                        if (child) {
                            this.traverseLua(child, currentName, types, current, content, startPos);
                        }
                    }
                } else {
                    if (node[key]) {
                        this.traverseLua(node[key], currentName, types, current, content, startPos);
                    }
                }
            }
        }
    }

    private luaIfStatement(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'closure':
                    const item = this.createContextItemForLua(node, node.type, parentName, true, undefined, content, startPos);
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    private luaLocalStatement(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'variable':
                    const item = this.createContextItemForLua(node, node.type, parentName, true, undefined, content, startPos);
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    private luaAssignmentStatement(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'variable':
                    const item = this.createContextItemForLua(node, node.type, parentName, true, undefined, content, startPos);
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    private luaForLoopStatement(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'variable':
                    const item = this.createContextItemForLua(node, node.type, parentName, true, undefined, content, startPos);
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    private luaCallExpression(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    const item = this.createContextItemForLua(node, node.type, parentName, true, this.getLuaFunctionName(node.base), content, startPos);
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    private luaFunctionExpression(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'closure':
                    const item = this.createContextItemForLua(node, node.type, parentName, true, undefined, content, startPos)
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    private luaIndexExpression(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'closure':
                    const item = this.createContextItemForLua(node, node.type, parentName, true, this.getLuaFunctionName(node.base), content, startPos);
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    private luaMemberExpression(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'variable':
                    if (node.base && node.base.type === 'Identifier' && node.identifier) {
                        const item = this.createContextItemForLua(node, node.type, parentName, true, this.getLuaFunctionName(node), content, startPos);
                        current = {value: item, children: []};
                    }
                    break;
            }
        }
        return current;
    }

    private luaFunctionDeclaration(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    const item = this.createContextItemForLua(node, node.type, parentName, false, this.getLuaFunctionName(node.identifier), content, startPos);
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    private luaIdentifier(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'variable':
                    let varText = node.name;
                    if (node.parent) {
                        if (node.parent.type === 'LocalStatement' || 
                            node.parent.type === 'AssignmentStatement') {
                            varText = content.substring(node.parent.range[0] + startPos, node.parent.range[1] + startPos);
                        }
                    }
                    const item = this.createContextItemForLua(node, node.type, parentName, true, node.name, content, startPos, varText);
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    private luaStringLiteral(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'variable':
                    if (typeof node.value === 'string' && node.value.match(/[A-Z_][A-Z0-9_]+/)) {
                        const item = this.createContextItemForLua(node, node.type, parentName, true, node.value, content, startPos);
                        current = {value: item, children: []};
                    }
                    break;
            }
        }
        return current;
    }

    protected getLuaFunctionName(identifier: any): string {
        if (!identifier) {
            return 'anonymous';
        }
        if (identifier.type === 'Identifier') {
            return identifier.name;
        } else if (identifier.type === 'MemberExpression') {
            return `${this.getLuaFunctionName(identifier.base)}.${this.getLuaFunctionName(identifier.identifier)}`;
        } else {
            return '';
        }
    }

    protected createContextItemForLua(node: any, type: string, parentName: string, needRange: boolean, name: string | undefined, content: string, startPos: number, replaceContent?: string, statement?: any): ContextItem {
        let start: number;
        let end: number;
        if (statement) {
            start = statement.range[0] + startPos;
            end = statement.range[1] + startPos;
        } else {
            start = node.range[0] + startPos;
            end = node.range[1] + startPos;
        }
        if (needRange) {
            parentName = `${parentName}>${start}~${end}`;
        }
        if (name) {
            name = `${parentName}>${name}`;
        } else {
            name = parentName;
        }
        const result = {
            type: type,
            name: name,
            range: {
                start: start,
                end: end
            }
        }
        return result;
    }

    // protected getLuaFunctionName(node: any): any | null {
    //     const prefixNode = node.childForFieldName('prefix');
    //     const nameNode = node.childForFieldName('name');
        
    //     if (prefixNode && nameNode) {
    //         return this.getDotFunctionName(prefixNode, nameNode);
    //     } else if (nameNode) {
    //         return nameNode;
    //     }
    //     return null;
    // }

    protected getDotFunctionName(prefixNode: any, nameNode: any): any {
        const prefix = prefixNode.type === 'identifier' ? prefixNode.text : 
                    (prefixNode.type === 'field_expression' ? 
                    this.getDotFunctionName(prefixNode.childForFieldName('prefix'), 
                    prefixNode.childForFieldName('name')) : 
                    prefixNode.text);
        
        return {
            text: `${prefix}.${nameNode.text}`,
            startIndex: prefixNode.startIndex,
            endIndex: nameNode.endIndex
        };
    }

    protected findTableVariableName(tableNode: any): string | null {
        let parent = tableNode.parent;
        while (parent) {
            if (parent.type === 'assignment_statement') {
                const variableList = parent.childForFieldName('left');
                if (variableList && variableList.type === 'variable_list') {
                    const firstVar = variableList.child(0);
                    if (firstVar && firstVar.type === 'identifier') {
                        return firstVar.text;
                    }
                }
            }
            parent = parent.parent;
        }
        return null;
    }

    protected traversePython(node: any, parentName: string, types: IdentifierType[], parent: ContextTreeNode | undefined, content: string, startPos: number) {
        let current: ContextTreeNode | undefined = undefined
        switch (node.type) {
            case 'function_definition':
                current = this.pythonFunctionDefinition(node, parentName, types, content, startPos);
                break;
            case 'lambda':
                current = this.pythonLambda(node, parentName, types, content, startPos);
                break;
            case 'class_definition':
                current = this.pythonClassDefinition(node, parentName, types, content, startPos);
                break;
        }
        let currentName = parentName;
        if (current) {
            parent?.children.push(current);
            currentName = current.value?.name as string;
        } else {
            current = parent;
        }
        if (node.type !== 'class_definition') {
            for (let i = 0; i < node.childCount; i++) {
                this.traversePython(node.child(i), currentName, types, current, content, startPos);
            }
        }
    }

    private pythonFunctionDefinition(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    if (!this.isInsideClass(node)) {
                        const nameNode = node.childForFieldName('name');
                        if (nameNode) {
                            const item = this.createContextItem(nameNode, parentName, startPos, node.type, content, node);
                            current = {value: item, children: []};
                        }
                    }
                    break;
            }
        }
        return current;
    }

    private pythonLambda(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    const item = this.createContextItem(node, parentName, startPos, node.type, content);
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    private pythonClassDefinition(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    const classNameNode = node.childForFieldName('name');
                    if (classNameNode) {
                        const className = classNameNode.text;
                        const classBody = node.childForFieldName('body');
                        if (classBody) {
                            current = {value: undefined, children: []};
                            for (let i = 0; i < classBody.childCount; i++) {
                                const child = classBody.child(i);
                                if (child.type === 'function_definition') {
                                    const methodNameNode = child.childForFieldName('name');
                                    if (methodNameNode) {
                                        const fullMethodName = `${className}.${methodNameNode.text}`;
                                        const item = this.createContextItem(methodNameNode, parentName, startPos, child.type, content, child, fullMethodName);
                                        current.children.push({value: item, children: []});
                                    }
                                }
                            }
                        }
                    }
                    break;
            }
        }
        return current;
    }

    protected traverseJavaScript(node: any, parentName: string, types: IdentifierType[], parent: ContextTreeNode | undefined, content: string, startPos: number) {
        let current: ContextTreeNode | undefined = undefined;
        switch (node.type) {
            case 'function_declaration':
                current = this.jsFunctionDefinition(node, parentName, types, content, startPos);
                break;
            case 'arrow_function':
                current = this.jsArrowFunction(node, parentName, types, content, startPos);
                break;
            case 'class_declaration':
                current = this.jsClassDefinition(node, parentName, types, content, startPos);
                break;
            case 'function':
            case 'generator_function':
                current = this.jsGeneratorFunction(node, parentName, types, content, startPos);
                break;
        }
        let currentName = parentName;
        if (current) {
            parent?.children.push(current);
            currentName = current.value?.name as string;
        } else {
            current = parent;
        }
        for (let i = 0; i < node.childCount; i++) {
            this.traverseJavaScript(node.child(i), currentName, types, current, content, startPos);
        }
    }

    private jsFunctionDefinition(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    const nameNode = node.childForFieldName('name');
                    if (nameNode) {
                        const item = this.createContextItem(nameNode, parentName, startPos, node.type, content, node)
                        current = {value: item, children: []};
                    }
                    break;
            }
        }
        return current;
    }

    private jsArrowFunction(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    const functionName = this.getArrowFunctionName(node) || 'anonymous';
                    const item = this.createContextItem(node, parentName, startPos, node.type, content, node, functionName)
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    private jsClassDefinition(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    const classNameNode = node.childForFieldName('name');
                    if (classNameNode) {
                        const className = classNameNode.text;
                        const classBody = node.childForFieldName('body');
                        if (classBody) {
                            current = {value: undefined, children: []};
                            for (let i = 0; i < classBody.childCount; i++) {
                                const child = classBody.child(i);
                                if (child.type === 'method_definition') {
                                    const methodNameNode = child.childForFieldName('name');
                                    if (methodNameNode) {
                                        const methodName = methodNameNode.text;
                                        const fullMethodName = `${className}.${methodName}`;
                                        const item = this.createContextItem(methodNameNode, parentName, startPos, child.type, content, child, fullMethodName)
                                        current.children.push({value: item, children: []});
                                    }
                                } else if (child.type === 'public_field_definition') {
                                    const fieldNameNode = child.childForFieldName('name');
                                    const valueNode = child.childForFieldName('value');
                                    if (fieldNameNode && valueNode && valueNode.type === 'arrow_function') {
                                        const fieldName = fieldNameNode.text;
                                        const fullName = `${className}.${fieldName}`;
                                        const item = this.createContextItem(valueNode, parentName, startPos, child.type, content, valueNode, fullName);
                                        current.children.push({value: item, children: []});
                                    }
                                }
                            }
                        }
                    }
                    break;
            }
        }
        return current;
    }

    private jsGeneratorFunction(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    const nameNode = node.childForFieldName('name');
                    const functionName = nameNode ? nameNode.text : this.getFunctionExpressionName(node) || 'anonymous';
                    const item = this.createContextItem(node, parentName, startPos, node.type, content, node, functionName)
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    protected traverseCpp(node: any, parentName: string, types: IdentifierType[], parent: ContextTreeNode | undefined, content: string, startPos: number) {
        let current: ContextTreeNode | undefined = undefined;
        switch (node.type) {
            case 'function_definition':
                current = this.cppFunctionDefinition(node, parentName, types, content, startPos);
                break;
            case 'class_specifier':
                current = this.cppClassSpecifier(node, parentName, types, content, startPos);
                break;
            case 'lambda_expression':
                current = this.cppLambdaExpression(node, parentName, types, content, startPos);
                break;
        }
        let currentName = parentName;
        if (current) {
            parent?.children.push(current);
            currentName = current.value?.name as string;
        } else {
            current = parent;
        }
        for (let i = 0; i < node.childCount; i++) {
            this.traverseCpp(node.child(i), currentName, types, current, content, startPos);
        }
    }

    private cppFunctionDefinition(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    const declarator = node.childForFieldName('declarator');
                    if (declarator) {
                        const functionNameNode = this.findFunctionNameInDeclarator(declarator);
                        if (functionNameNode) {
                            const item = this.createContextItem(functionNameNode, parentName, startPos, node.type, content, node)
                            current = {value: item, children: []};
                        }
                    }
                    break;
            }
        }
        return current;
    }

    private cppClassSpecifier(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    const classNameNode = node.childForFieldName('name');
                    if (classNameNode) {
                        const className = classNameNode.text;
                        const classBody = node.childForFieldName('body');
                        if (classBody) {
                            current = {value: undefined, children: []};
                            for (let i = 0; i < classBody.childCount; i++) {
                                const child = classBody.child(i);
                                if (child.type === 'function_definition') {
                                    const declarator = child.childForFieldName('declarator');
                                    if (declarator) {
                                        const functionNameNode = this.findFunctionNameInDeclarator(declarator);
                                        if (functionNameNode) {
                                            const fullMethodName = `${className}::${functionNameNode.text}`;
                                            const item = this.createContextItem(functionNameNode, parentName, startPos, child.type, content, child, fullMethodName)
                                            current.children.push({value: item, children: []});
                                        }
                                    }
                                } else if (child.type === 'constructor_or_destructor_definition') {
                                    const nameNode = child.childForFieldName('name');
                                    if (nameNode) {
                                        const fullName = (nameNode.text === className) 
                                            ? `${className}::${className}` // 构造函数
                                            : `${className}::~${className}`; // 析构函数
                                        const item = this.createContextItem(nameNode, parentName, startPos, child.type, content, child, fullName)
                                        current.children.push({value: item, children: []});
                                    }
                                }
                            }
                        }
                    }
                    break;
            }
        }
        return current;
    }

    private cppLambdaExpression(node: any, parentName: string, types: IdentifierType[], content: string, startPos: number): ContextTreeNode | undefined {
        let current: ContextTreeNode | undefined = undefined;
        for (const type of types) {
            switch (type) {
                case 'function':
                    const item = this.createContextItem(node, parentName, startPos, node.type, content, node, 'lambda')
                    current = {value: item, children: []};
                    break;
            }
        }
        return current;
    }

    protected isInsideClass(node: any): boolean {
        let parent = node.parent;
        while (parent) {
            if (parent.type === 'class_definition') {
                return true;
            }
            parent = parent.parent;
        }
        return false;
    }

    protected getArrowFunctionName(node: any): string | null {
        if (!node.parent) {
            return null;
        }
        if (node.parent.type === 'variable_declarator') {
            const nameNode = node.parent.childForFieldName('name');
            return nameNode?.text || null;
        } else if (node.parent.type === 'assignment_expression') {
            const leftNode = node.parent.childForFieldName('left');
            return leftNode?.text || null;
        } else if (node.parent.type === 'public_field_definition') {
            const nameNode = node.parent.childForFieldName('name');
            return nameNode?.text || null;
        } else {
            return null;
        }
    }

    protected getFunctionExpressionName(node: any): string | null {
        if (!node.parent) {
            return null;
        }
        if (node.parent.type === 'variable_declarator') {
            const nameNode = node.parent.childForFieldName('name');
            return nameNode?.text || null;
        } else if (node.parent.type === 'assignment_expression') {
            const leftNode = node.parent.childForFieldName('left');
            return leftNode?.text || null;
        } else if (node.parent.type === 'pair') {
            const keyNode = node.parent.childForFieldName('key');
            return keyNode?.text || null;
        } else {
            return null;
        }
    }

    protected findFunctionNameInDeclarator(declarator: any): any | null {
        if (declarator.type === 'identifier') {
            return declarator;
        }
        if (declarator.type === 'function_declarator') {
            const declaratorNode = declarator.childForFieldName('declarator');
            if (declaratorNode) {
                return this.findFunctionNameInDeclarator(declaratorNode);
            }
        } else if (declarator.type === 'parenthesized_declarator') {
            return this.findFunctionNameInDeclarator(declarator.child(1));
        } else if (declarator.type === 'qualified_identifier') {
            const nameNode = declarator.childForFieldName('name');
            if (nameNode) {
                return nameNode;
            }
        }
        for (let i = 0; i < declarator.childCount; i++) {
            const result = this.findFunctionNameInDeclarator(declarator.child(i));
            if (result) {
                return result;
            }
        }
        
        return null;
    }

    // protected createReferenceOption(node: any, content: string, contentNode?: any, customName?: string): ContextOption {
    //     const targetNode = contentNode || node;
    //     let functionName = customName;
    //     if (!functionName) {
    //         if (node.type === 'identifier') {
    //             functionName = node.text;
    //         } else if (node.type === 'lambda' || 
    //                node.type === 'arrow_function' || 
    //                node.type === 'lambda_expression' ||
    //                node.type === 'function_definition' && !customName) {
    //             functionName = 'anonymous';
    //         } else {
    //             functionName = node.text || 'unknown';
    //         }
    //     }
    //     functionName = functionName as string;
    //     return {
    //         type: 'function',
    //         id: functionName,
    //         name: functionName,
    //         describe: `函数: ${functionName}`,
    //         contextItem: {
    //             type: 'function',
    //             name: functionName,
    //             content: content.substring(targetNode.startIndex, targetNode.endIndex),
    //             range: {
    //                 start: targetNode.startPosition.row + 1,
    //                 end: targetNode.endPosition.row + 1
    //             }
    //         }
    //     };
    // }

    protected createContextItem(node: any, parentName: string, startPos: number, type: string, content: string, contentNode?: any, customName?: string): ContextItem {
        const targetNode = contentNode || node;
        let name = customName;
        if (!name) {
            if (node.type === 'identifier') {
                name = node.text;
            } else if (node.type === 'lambda' || 
                   node.type === 'arrow_function' || 
                   node.type === 'lambda_expression' ||
                   node.type === 'function_definition' && !customName) {
                name = 'anonymous';
            } else {
                name = node.text || 'unknown';
            }
        }
        name = name as string;
        name = `${parentName}>${name}`;
        const result = {
            type: type,
            name: name,
            content: content.substring(targetNode.startIndex + startPos, targetNode.endIndex + startPos),
            range: {
                start: targetNode.startIndex + startPos,
                end: targetNode.endIndex + startPos,
                startLine: targetNode.startPosition.row + 1,
                endLine: targetNode.endPosition.row + 1
            }
        };
        return result;
    }

    protected ContextItemToOptions(result: ContextOption[], current: ContextTreeNode) {
        const value = current.value;
        if (value) {
            const item = this.ContextItemToOption(value);
            result.push(item);
        }
        const children = current.children;
        for (const child of children) {
            this.ContextItemToOptions(result, child);
        }
    }

    protected ContextItemToOption(item: ContextItem): ContextOption {
        return {
            type: item.type,
            id: item.name,
            name: item.name,
            describe: `${item.type}: ${item.name}`,
            contextItem: item
        };
    }
}