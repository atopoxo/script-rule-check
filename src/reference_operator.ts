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
        cpp: (content) => this.parseCpp(content)
    };
    private filters = ['js', 'ts', 'py', 'lua', 'c', 'cc', 'h', 'hpp', 'cpp'];
    private folderBlackList = ['node_modules', 'build', '.git', '.vscode'];

    constructor(private extensionName: string) {
    }

    getOptions(data: object | undefined): ReferenceOption[] {
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

        this.traverseLua(ast, content, functions);
        return functions;
    }

    // parseLua(content: string): ReferenceOption[] {
    //     const Parser = require('tree-sitter');
    //     const parser = new Parser();
    //     const language = require('tree-sitter-lua');
    //     parser.setLanguage(language);
    //     const ast = parser.parse(content);
    //     const functions: ReferenceOption[] = [];
        
    //     this.traverseLua(ast.rootNode, content, functions);

    //     return functions;
    // }

    parsePython(content: string): ReferenceOption[] {
        const Parser = require('tree-sitter');
        const parser = new Parser();
        const language = require('tree-sitter-python');
        parser.setLanguage(language);
        const ast = parser.parse(content);
        const functions: ReferenceOption[] = [];
        
        this.traversePython(ast.rootNode, content, functions);

        return functions;
    }

    parseJsTs(content: string): ReferenceOption[] {
        const Parser = require('tree-sitter');
        const parser = new Parser();
        const JavaScript = require('tree-sitter-javascript');
        const TypeScript = require('tree-sitter-typescript');
        const isTypeScript = /\.tsx?$/.test(content) || /(^|\n)\s*@ts-/.test(content);
        const language = isTypeScript ? TypeScript.typescript : JavaScript;
        parser.setLanguage(language);
        const ast = parser.parse(content);
        const functions: ReferenceOption[] = [];
        
        this.traverseJavaScript(ast.rootNode, content, functions);

        return functions;
    }

    parseCpp(content: string): ReferenceOption[] {
        const Parser = require('tree-sitter');
        const parser = new Parser();
        const language = require('tree-sitter-cpp');
        parser.setLanguage(language);
        const ast = parser.parse(content);
        const functions: ReferenceOption[] = [];
        
        this.traverseCpp(ast.rootNode, content, functions);

        return functions;
    }

    // traverseLua(node: any, content: string, functions: ReferenceOption[]) {
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

    traverseLua(node: any, content: string, functions: ReferenceOption[]) {
        if (node.type === 'FunctionDeclaration') {
            const functionName = this.getLuaFunctionName(node.identifier);
            const functionContent = content.substring(node.range[0], node.range[1]);
            functions.push(this.createReferenceOptionForLua(node, functionName, functionContent));
        } else if (node.type === 'LocalStatement' && node.init && node.init[0]?.type === 'FunctionExpression') {
            const functionName = node.variables[0].name;
            const funcBody = node.init[0];
            const functionContent = content.substring(funcBody.range[0], funcBody.range[1]);
            functions.push(this.createReferenceOptionForLua(funcBody, functionName, functionContent));
        } else if (node.type === 'AssignmentStatement' && node.init[0]?.type === 'FunctionExpression') {
            const functionName = this.getLuaFunctionName(node.variables[0]);
            const funcBody = node.init[0];
            const functionContent = content.substring(funcBody.range[0], funcBody.range[1]);
            functions.push(this.createReferenceOptionForLua(funcBody, functionName, functionContent));
        }
        if (node.body) {
            node.body.forEach((childNode: any) => this.traverseLua(childNode, content, functions));
        }
        if (node.expression) {
            this.traverseLua(node.expression, content, functions);
        }
        if (node.init && Array.isArray(node.init)) {
            node.init.forEach((childNode: any) => this.traverseLua(childNode, content, functions));
        }
        if (node.arguments) {
            node.arguments.forEach((childNode: any) => this.traverseLua(childNode, content, functions));
        }
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

    createReferenceOptionForLua(node: any, functionName: string, functionContent: string): ReferenceOption {
        return {
            type: 'function',
            id: functionName,
            name: functionName,
            describe: `函数: ${functionName}`,
            reference: {
                type: 'function',
                name: functionName,
                content: functionContent,
                range: {
                    start: node.loc.start.line,
                    end: node.loc.end.line
                }
            }
        }
    }

    // getLuaFunctionName(node: any): any | null {
    //     const prefixNode = node.childForFieldName('prefix');
    //     const nameNode = node.childForFieldName('name');
        
    //     if (prefixNode && nameNode) {
    //         return this.getDotFunctionName(prefixNode, nameNode);
    //     } else if (nameNode) {
    //         return nameNode;
    //     }
    //     return null;
    // }

    // getDotFunctionName(prefixNode: any, nameNode: any): any {
    //     const prefix = prefixNode.type === 'identifier' ? prefixNode.text : 
    //                 (prefixNode.type === 'field_expression' ? 
    //                 this.getDotFunctionName(prefixNode.childForFieldName('prefix'), 
    //                 prefixNode.childForFieldName('name')) : 
    //                 prefixNode.text);
        
    //     return {
    //         text: `${prefix}.${nameNode.text}`,
    //         startIndex: prefixNode.startIndex,
    //         endIndex: nameNode.endIndex
    //     };
    // }

    // findTableVariableName(tableNode: any): string | null {
    //     let parent = tableNode.parent;
    //     while (parent) {
    //         if (parent.type === 'assignment_statement') {
    //             const variableList = parent.childForFieldName('left');
    //             if (variableList && variableList.type === 'variable_list') {
    //                 const firstVar = variableList.child(0);
    //                 if (firstVar && firstVar.type === 'identifier') {
    //                     return firstVar.text;
    //                 }
    //             }
    //         }
    //         parent = parent.parent;
    //     }
    //     return null;
    // }

    traversePython(node: any, content: string, functions: ReferenceOption[]) {
        if (node.type === 'function_definition') {
            if (!this.isInsideClass(node)) {
                const nameNode = node.childForFieldName('name');
                if (nameNode) {
                    const referenceOption = this.createReferenceOption(nameNode, content, node);
                    functions.push(referenceOption);
                }
            }
        } else if (node.type === 'lambda') {
            const referenceOption = this.createReferenceOption(node, content);
            functions.push(referenceOption);
        } else if (node.type === 'class_definition') {
            const classNameNode = node.childForFieldName('name');
            if (classNameNode) {
                const className = classNameNode.text;
                const classBody = node.childForFieldName('body');
                if (classBody) {
                    for (let i = 0; i < classBody.childCount; i++) {
                        const child = classBody.child(i);
                        if (child.type === 'function_definition') {
                            const methodNameNode = child.childForFieldName('name');
                            if (methodNameNode) {
                                const fullMethodName = `${className}.${methodNameNode.text}`;
                                functions.push(this.createReferenceOption(
                                    methodNameNode, 
                                    content, 
                                    child,
                                    fullMethodName
                                ));
                            }
                        }
                    }
                }
            }
        }
        if (node.type !== 'class_definition') {
            for (let i = 0; i < node.childCount; i++) {
                this.traversePython(node.child(i), content, functions);
            }
        }
    }

    traverseJavaScript(node: any, content: string, functions: ReferenceOption[]) {
        if (node.type === 'function_declaration') {
            const nameNode = node.childForFieldName('name');
            if (nameNode) {
                functions.push(this.createReferenceOption(nameNode, content, node));
            }
        } else if (node.type === 'arrow_function') {
            const functionName = this.getArrowFunctionName(node) || 'anonymous';
            functions.push(this.createReferenceOption(node, content, node, functionName));
        } else if (node.type === 'class_declaration') {
            const classNameNode = node.childForFieldName('name');
            if (classNameNode) {
                const className = classNameNode.text;
                const classBody = node.childForFieldName('body');
                if (classBody) {
                    for (let i = 0; i < classBody.childCount; i++) {
                        const child = classBody.child(i);
                        if (child.type === 'method_definition') {
                            const methodNameNode = child.childForFieldName('name');
                            if (methodNameNode) {
                                const methodName = methodNameNode.text;
                                const fullMethodName = `${className}.${methodName}`;
                                functions.push(this.createReferenceOption(methodNameNode, content, child, fullMethodName));
                            }
                        } else if (child.type === 'public_field_definition') {
                            const fieldNameNode = child.childForFieldName('name');
                            const valueNode = child.childForFieldName('value');
                            
                            if (fieldNameNode && valueNode && valueNode.type === 'arrow_function') {
                                const fieldName = fieldNameNode.text;
                                const fullName = `${className}.${fieldName}`;
                                functions.push(this.createReferenceOption(valueNode, content, valueNode, fullName));
                            }
                        }
                    }
                }
            }
        } else if (node.type === 'function' || node.type === 'generator_function') {
            const nameNode = node.childForFieldName('name');
            const functionName = nameNode ? nameNode.text : this.getFunctionExpressionName(node) || 'anonymous';
            
            functions.push(this.createReferenceOption(node, content, node, functionName));
        }
        
        for (let i = 0; i < node.childCount; i++) {
            this.traverseJavaScript(node.child(i), content, functions);
        }
    }

    traverseCpp(node: any, content: string, functions: ReferenceOption[]) {
        if (node.type === 'function_definition') {
            const declarator = node.childForFieldName('declarator');
            if (declarator) {
                const functionNameNode = this.findFunctionNameInDeclarator(declarator);
                if (functionNameNode) {
                    functions.push(this.createReferenceOption(functionNameNode, content, node));
                }
            }
        } else if (node.type === 'class_specifier') {
            const classNameNode = node.childForFieldName('name');
            if (classNameNode) {
                const className = classNameNode.text;
                const classBody = node.childForFieldName('body');
                if (classBody) {
                    for (let i = 0; i < classBody.childCount; i++) {
                        const child = classBody.child(i);
                        if (child.type === 'function_definition') {
                            const declarator = child.childForFieldName('declarator');
                            if (declarator) {
                                const functionNameNode = this.findFunctionNameInDeclarator(declarator);
                                if (functionNameNode) {
                                    const fullMethodName = `${className}::${functionNameNode.text}`;
                                    functions.push(this.createReferenceOption(functionNameNode, content, child, fullMethodName));
                                }
                            }
                        } else if (child.type === 'constructor_or_destructor_definition') {
                            const nameNode = child.childForFieldName('name');
                            if (nameNode) {
                                const fullName = (nameNode.text === className) 
                                    ? `${className}::${className}` // 构造函数
                                    : `${className}::~${className}`; // 析构函数
                                functions.push(this.createReferenceOption(nameNode, content, child, fullName));
                            }
                        }
                    }
                }
            }
        } else if (node.type === 'lambda_expression') {
            functions.push(this.createReferenceOption(node, content, node, 'lambda'));
        }
        for (let i = 0; i < node.childCount; i++) {
            this.traverseCpp(node.child(i), content, functions);
        }
    }

    isInsideClass(node: any): boolean {
        let parent = node.parent;
        while (parent) {
            if (parent.type === 'class_definition') {
                return true;
            }
            parent = parent.parent;
        }
        return false;
    }

    getArrowFunctionName(node: any): string | null {
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

    getFunctionExpressionName(node: any): string | null {
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

    findFunctionNameInDeclarator(declarator: any): any | null {
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

    createReferenceOption(node: any, content: string, contentNode?: any, customName?: string): ReferenceOption {
        const targetNode = contentNode || node;
        let functionName = customName;
        if (!functionName) {
            if (node.type === 'identifier') {
                functionName = node.text;
            } else if (node.type === 'lambda' || 
                   node.type === 'arrow_function' || 
                   node.type === 'lambda_expression' ||
                   node.type === 'function_definition' && !customName) {
                functionName = 'anonymous';
            } else {
                functionName = node.text || 'unknown';
            }
        }
        functionName = functionName as string;
        return {
            type: 'function',
            id: functionName,
            name: functionName,
            describe: `函数: ${functionName}`,
            reference: {
                type: 'function',
                name: functionName,
                content: content.substring(targetNode.startIndex, targetNode.endIndex),
                range: {
                    start: targetNode.startPosition.row + 1,
                    end: targetNode.endPosition.row + 1
                }
            }
        };
    }

    // parseVue(content: string): ReferenceOption[] {
    //     const ast = require('vue-template-compiler').parseComponent(content);
    //     const functions: ReferenceOption[] = [];

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

    getEncoding(buffer: Buffer): BufferEncoding {
        const encoding = chardet.detect(buffer) || 'gbk';
        return encoding;
    }
}