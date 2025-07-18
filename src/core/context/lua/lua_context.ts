import { ContextItem, ContextTreeNode } from '../../ai_model/base/ai_types';
import { ContextBase } from '../../context/base/context_base';
import { Scope } from '../../types/scope'

export type DependencyGraphType = Map<string, Set<string>>;
export type DefinitionMapType = Map<string, ContextItem>;

export interface ScopeNode {
    stack: Map<string, Scope>[];
    current: Scope | undefined;
    currentDepth: number;
    filePath: string;
}

export class LuaContext extends ContextBase {
    private dependencyFilters = new Set();
    private filters = new Map<string, Set<string>>();
    constructor() {
        super();
        this.initFilters();
        let filters = ['type', 'range', 'loc'];
        filters.forEach(filter => this.dependencyFilters.add(filter));
    }

    private initFilters() {
        const types: string[] = [
            'CallExpression',
            'MemberExpression',
            'FunctionDeclaration',
            'FunctionExpression',
            'LocalStatement',
            'AssignmentStatement',
            'ForNumericStatement',
            'ForGenericStatement'
        ];
        for (const type of types) {
            switch (type) {
                case 'CallExpression':
                    this.filters.set(type, new Set(['type', 'range', 'loc', 'identifier']));
                    break;
                case 'MemberExpression':
                    this.filters.set(type, new Set(['type', 'range', 'loc', 'identifier']));
                    break;
                case 'FunctionDeclaration':
                case 'FunctionExpression':
                    this.filters.set(type, new Set(['type', 'range', 'loc', 'identifier']));
                    break;
                case 'AssignmentStatement':
                    this.filters.set(type, new Set(['type', 'range', 'loc', 'identifier']));
                    break;
                case 'LocalStatement':
                    this.filters.set(type, new Set(['type', 'range', 'loc', 'identifier', 'variables']));
                    break;
                case 'ForNumericStatement':
                case 'ForGenericStatement':
                    this.filters.set(type, new Set(['type', 'range', 'loc', 'identifier', 'variable', 'variables']));
                    break;
                default:
                    this.filters.set(type, new Set(['*']));
                    break;
            }
        }
    }

    public buildTree(contextTree: ContextTreeNode | undefined, scopeNode: ScopeNode, root: any, content: string, startPos: number) {
        const traverse = (parentTree: ContextTreeNode | undefined, current: any, statement: any) => {
            const isLocalFunction = this.isLocalFunction(scopeNode, current);
            if (isLocalFunction) {
                this.enterNewScope(undefined, undefined, parentTree, scopeNode, current, content, startPos, statement, true);   
            }
            const currentTree = this.processNodeForDependencies(undefined, undefined, parentTree, scopeNode, current, content, startPos, statement);
            const filters = this.filters.get(current.type);
            if (!filters?.has("*")) {
                for (const key in current) {
                    if (filters?.has(key)) {
                        continue;
                    }
                    if (current.hasOwnProperty(key) && typeof current[key] === 'object') {
                        if (this.isScopeNode(current, key)) {
                            this.enterNewScope(undefined, undefined, parentTree, scopeNode, current, content, startPos, statement);
                        }
                        if (Array.isArray(current[key])) {
                            for (const child of current[key]) {
                                if (child) {
                                    traverse(currentTree, child, statement);
                                }
                            }
                        } else {
                            if (current[key]) {
                                traverse(currentTree, current[key], statement);
                            }
                        }
                        if (this.isScopeNode(current, key)) {
                            this.exitScope(scopeNode);
                        }
                    }
                }
            }
            if (isLocalFunction) {
                this.exitScope(scopeNode);   
            }
        };
        traverse(contextTree, root, undefined);
    }

    public buildDependencyGraph(definitionMap: DefinitionMapType, dependencyGraph: DependencyGraphType, scopeNode: ScopeNode, root: any, content: string, startPos: number) {
        const traverse = (current: any, statement: any) => {
            if (this.isRangeChange(current)) {
                statement = current;
            }
            const isLocalFunction = this.isLocalFunction(scopeNode, current);
            if (isLocalFunction) {
                this.enterNewScope(definitionMap, dependencyGraph, undefined, scopeNode, current, content, startPos, statement, true);   
            }
            const filters = this.filters.get(current.type);
            if (!filters?.has("*")) {
                for (const key in current) {
                    if (filters?.has(key)) {
                        continue;
                    }
                    if (current.hasOwnProperty(key) && typeof current[key] === 'object') {
                        if (this.isScopeNode(current, key)) {
                            this.enterNewScope(definitionMap, dependencyGraph, undefined, scopeNode, current, content, startPos, statement);
                        }
                        if (Array.isArray(current[key])) {
                            for (const child of current[key]) {
                                if (child) {
                                    traverse(child, statement);
                                }
                            }
                        } else {
                            if (current[key]) {
                                traverse(current[key], statement);
                            }
                        }
                        if (this.isScopeNode(current, key)) {
                            this.exitScope(scopeNode);
                        }
                    }
                }
            }
            this.processNodeForDependencies(definitionMap, dependencyGraph, undefined, scopeNode, current, content, startPos, statement);
            if (isLocalFunction) {
                this.exitScope(scopeNode);
            }
        };
        traverse(root, undefined);
    }

    protected processNodeForDependencies(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, 
            scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any): ContextTreeNode | undefined {
        let contextTree: ContextTreeNode | undefined = keywordTree;
        switch (current.type) {
            case 'Identifier':
                contextTree = this.processIdentifierDependencies(definitionMap, dependencyGraph, keywordTree, scopeNode, current, content, startPos, statement);
                break;
            case 'MemberExpression':
                contextTree = this.processMemberDependencies(definitionMap, dependencyGraph, keywordTree, scopeNode, current, content, startPos, statement);
                break;
            case 'CallExpression':
                contextTree = this.processCallDependencies(definitionMap, dependencyGraph, keywordTree, scopeNode, current, content, startPos, statement);
                break;
            case 'FunctionDeclaration':
            case 'FunctionExpression':
                contextTree = this.processFunctionDependencies(definitionMap, dependencyGraph, keywordTree, scopeNode, current, content, startPos, statement);
                break;
            case 'AssignmentStatement':
                contextTree = this.processAssignmentDependencies(definitionMap, dependencyGraph, keywordTree, scopeNode, current, content, startPos, statement);
                break;
            case 'LocalStatement':
                contextTree = this.processLocalDependencies(definitionMap, dependencyGraph, keywordTree, scopeNode, current, content, startPos, statement);
                break;
        }
        return contextTree;
    }

    private processBlockScopeVariables(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, contextTree: ContextTreeNode | undefined,
        scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any) {
        switch (current.type) {
            case 'ForNumericStatement':
                const varName = current.variable.name;
                const scopedName = this.getScopedName(varName, scopeNode);
                if (definitionMap && dependencyGraph) {
                    this.checkDefineNode(definitionMap, scopeNode, current.variable, content, startPos, statement, varName, scopedName);
                    if (!dependencyGraph.has(scopedName)) {
                        dependencyGraph.set(scopedName, new Set());
                    }
                    const depSet = dependencyGraph.get(scopedName)!;
                    const deps = new Set<string>();
                    const filters = this.filters.get(current.type);
                    for (const key in current) {
                        if (filters?.has(key)) {
                            continue;
                        }
                        if (current.hasOwnProperty(key) && typeof current[key] === 'object') {
                            if (Array.isArray(current[key])) {
                                for (const child of current[key]) {
                                    if (child) {
                                        this.collectDependenciesFromExpression(definitionMap, dependencyGraph, undefined, deps, scopeNode, child, content, startPos, statement);
                                    }
                                }
                            } else {
                                if (current[key]) {
                                    this.collectDependenciesFromExpression(definitionMap, dependencyGraph, undefined, deps, scopeNode, current[key], content, startPos, statement);
                                }
                            }
                        }
                    }
                    for (const dep of deps) {
                        depSet.add(dep);
                    }
                } else {
                    this.createTreeNode(contextTree as ContextTreeNode, scopeNode, current, content, startPos, statement, varName, scopedName);
                }
                break;
            case 'ForGenericStatement':
                for (const variable of current.variables) {
                    if (variable.type === 'Identifier') {
                        const varName = variable.name;
                        const scopedName = this.getScopedName(varName, scopeNode);
                        if (definitionMap && dependencyGraph) {
                            this.checkDefineNode(definitionMap, scopeNode, variable, content, startPos, statement, varName, scopedName);
                            if (!dependencyGraph.has(scopedName)) {
                                dependencyGraph.set(scopedName, new Set());
                            }
                            const depSet = dependencyGraph.get(scopedName)!;
                            const deps = new Set<string>();
                            this.collectDependenciesFromExpression(definitionMap, dependencyGraph, undefined, deps, scopeNode, current.iterators, content, startPos, statement);
                            for (const dep of deps) {
                                depSet.add(dep);
                            }
                        } else {
                            this.createTreeNode(contextTree as ContextTreeNode, scopeNode, current, content, startPos, statement, varName, scopedName);
                        }
                    }
                }
                break;
        }
    }

    protected processIdentifierDependencies(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, 
        scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any): ContextTreeNode | undefined {
        let result = this.UnaryDeal(definitionMap, dependencyGraph, keywordTree, scopeNode, current, content, startPos, statement);
        return result;
    }

    protected processMemberDependencies(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, 
        scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any): ContextTreeNode | undefined {
        let result = this.UnaryDeal(definitionMap, dependencyGraph, keywordTree, scopeNode, current, content, startPos, statement);
        return result;
    }

    private UnaryDeal(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, 
        scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any): ContextTreeNode | undefined {
        let name = '';
        let scopedName = '';
        let deep = true;
        let dependencyNode = current;
        if (current.type == 'Identifier') {
            name = current.name;
            scopedName = `${this.getScopedName(name, scopeNode)}-${current.range[0]}`;
        } else if (current.type == 'MemberExpression') {
            name = this.getFunctionName(current) as string;
            scopedName = this.getScopedName(this.getFunctionName(current, true) as string, scopeNode);
            deep = false;
            dependencyNode = current.base;
        } else {
            if (definitionMap && dependencyGraph) {
                return undefined;
            } else {
                return keywordTree;
            }
        }
        if (definitionMap && dependencyGraph) {
            this.checkDefineNode(definitionMap, scopeNode, current, content, startPos, statement, name, scopedName);
            const rightDeps = new Set<string>();
            this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, rightDeps, scopeNode, dependencyNode, content, startPos, statement, deep);
            if (rightDeps.size > 0) {
                if (!dependencyGraph.has(scopedName)) {
                    dependencyGraph.set(scopedName, new Set());
                }
                const deps = dependencyGraph.get(scopedName)!;
                for (const dep of rightDeps) {
                    deps.add(dep);
                }
            }
            return undefined;
        } else {
            this.createTreeNode(keywordTree as ContextTreeNode, scopeNode, current, content, startPos, statement, current.name, scopedName);
            return keywordTree;
        }
    }

    protected processCallDependencies(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, 
        scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any): ContextTreeNode | undefined {
        const funcName = this.getFunctionName(current.base);
        if (!funcName) {
            return;
        }
        let funcDeclareName = '';
        if (current.base.type == 'MemberExpression') {
            funcDeclareName = this.getScopedName(this.getFunctionName(current.base, true) as string, scopeNode);
        } else {
            funcDeclareName = `${this.getScopedName(funcName, scopeNode)}-${current.range[0]}`;
        }
        if (definitionMap && dependencyGraph) {
            this.checkDefineNode(definitionMap, scopeNode, current, content, startPos, statement, funcName, funcDeclareName);
            if (!dependencyGraph.has(funcDeclareName)) {
                dependencyGraph.set(funcDeclareName, new Set());
            }
            const depSet = dependencyGraph.get(funcDeclareName)!; 
            const deps = new Set<string>();
            for (const arg of current.arguments) {
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, deps, scopeNode, arg, content, startPos, statement);
            }
            for (const dep of deps) {
                depSet.add(dep);
            }
            return undefined;
        } else {
            const contextTreeNode = this.createTreeNode(keywordTree as ContextTreeNode, scopeNode, current, content, startPos, statement, funcName, funcDeclareName);
            return contextTreeNode;
        }
    }

    protected processFunctionDependencies(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, 
        scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any): ContextTreeNode | undefined {
        const funcName = this.getScopeName(current, startPos, 'function');
        const scopedFuncName = this.getScopedName(funcName, scopeNode);
        if (definitionMap && dependencyGraph) {
            this.checkDefineNode(definitionMap, scopeNode, current, content, startPos, statement, funcName, scopedFuncName);
            for (const param of current.parameters) {
                if (param.type === 'Identifier') {
                    const paramName = param.name;
                    const scopedParamName = this.resolveScopedName(scopeNode, paramName);
                    if (!dependencyGraph.has(scopedFuncName)) {
                        dependencyGraph.set(scopedFuncName, new Set());
                    }
                    dependencyGraph.get(scopedFuncName)!.add(scopedParamName);
                }
            }
            if (current.body) {
                this.enterNewScope(definitionMap, dependencyGraph, keywordTree, scopeNode, current, content, startPos, statement);
                const deps = new Set<string>();
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, deps, scopeNode, current.body, content, startPos, statement);
                if (deps.size > 0) {
                    if (!dependencyGraph.has(scopedFuncName)) {
                        dependencyGraph.set(scopedFuncName, new Set());
                    }
                    const depSet = dependencyGraph.get(scopedFuncName)!;
                    for (const dep of deps) {
                        depSet.add(dep);
                    }
                }
                this.exitScope(scopeNode);
            }
            return undefined;
        } else {
            const contextTreeNode = this.createTreeNode(keywordTree as ContextTreeNode, scopeNode, current, content, startPos, statement, funcName, scopedFuncName);
            return contextTreeNode;
        }
    }

    protected processLocalDependencies(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, 
        scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any): ContextTreeNode | undefined {
        if (definitionMap && dependencyGraph) {
            const leftVars: string[] = [];
            const isFileLocal = scopeNode.currentDepth == 0;
            if (isFileLocal) {
                this.enterNewScope(definitionMap, dependencyGraph, keywordTree, scopeNode, current, content, startPos, statement, isFileLocal);
            }
            for (const variable of current.variables) {
                if (variable.type === 'Identifier') {
                    const scopedName = this.getScopedName(variable.name, scopeNode);
                    leftVars.push(scopedName);
                    this.checkDefineNode(definitionMap, scopeNode, current, content, startPos, statement, variable.name, scopedName);
                }
            }
            if (isFileLocal) {
                this.exitScope(scopeNode);
            }
            const rightDeps = new Set<string>();
            if (current.init) {
                for (const expr of current.init) {
                    this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, rightDeps, scopeNode, expr, content, startPos, statement);
                }
            }
            for (const leftVar of leftVars) {
                if (rightDeps.size > 0) {
                    if (!dependencyGraph.has(leftVar)) {
                        dependencyGraph.set(leftVar, new Set());
                    }
                    const deps = dependencyGraph.get(leftVar)!;
                    for (const dep of rightDeps) {
                        deps.add(dep);
                    }
                }
            }
            return undefined;
        } else {
            const isFileLocal = scopeNode.currentDepth == 0;
            if (isFileLocal) {
                this.enterNewScope(definitionMap, dependencyGraph, keywordTree, scopeNode, current, content, startPos, statement, isFileLocal);
            }
            for (const variable of current.variables) {
                if (variable.type === 'Identifier') {
                    const scopedName = this.getScopedName(variable.name, scopeNode);
                    this.createTreeNode(keywordTree as ContextTreeNode, scopeNode, variable, content, startPos, statement, variable.name, scopedName);
                }
            }
            if (isFileLocal) {
                this.exitScope(scopeNode);
            }
            return keywordTree;
        }
    }

    protected processAssignmentDependencies(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, 
        scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any): ContextTreeNode | undefined {
        let name = '';
        let scopedName = '';
        if (definitionMap && dependencyGraph) {
            const leftVars: string[] = [];
            for (const variable of current.variables) {
                if (variable.type === 'Identifier') {
                    name = variable.name;
                    scopedName = `${this.getScopedName(name, scopeNode)}-${current.range[0]}`;
                    leftVars.push(scopedName);
                } else if (variable.type === 'MemberExpression') {
                    name = this.getFunctionName(variable) as string;
                    if (name) {
                        scopedName = this.getScopedName(this.getFunctionName(variable, true) as string, scopeNode);
                        leftVars.push(scopedName);
                    }
                }
                this.checkDefineNode(definitionMap, scopeNode, variable, content, startPos, statement, name, scopedName);
            }
            const rightDeps = new Set<string>();
            for (const expr of current.init) {
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, rightDeps, scopeNode, expr, content, startPos, statement);
            }
            for (const leftVar of leftVars) {
                if (rightDeps.size > 0) {
                    if (!dependencyGraph.has(leftVar)) {
                        dependencyGraph.set(leftVar, new Set());
                    }
                    const deps = dependencyGraph.get(leftVar)!;
                    for (const dep of rightDeps) {
                        deps.add(dep);
                    }
                }
            }
            return undefined;
        } else {
            for (const variable of current.variables) {
                if (variable.type === 'Identifier') {
                    name = variable.name;
                    scopedName = this.getScopedName(name, scopeNode);
                } else if (variable.type === 'MemberExpression') {
                    name = this.getFunctionName(variable) as string;
                    if (name) {
                        scopedName = this.getScopedName(this.getFunctionName(variable, true) as string, scopeNode);
                    }
                }
                this.createTreeNode(keywordTree as ContextTreeNode, scopeNode, variable, content, startPos, statement, name, scopedName);
            }
            return keywordTree;
        }
    }

    protected collectDependenciesFromExpression(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, dependencies: Set<string>,
        scopeNode: ScopeNode, node: any, content: string, startPos: number, statement: any, deep: boolean = false) {
        if (!node) {
            return;
        }
        const isBlockNode = this.isBlockScopeNode(node);
        if (isBlockNode) {
            this.enterNewScope(definitionMap, dependencyGraph, keywordTree, scopeNode, node, content, startPos, statement);
        }
        let name: string | null;
        switch (node.type) {
            case 'Identifier':
                name = node.name;
                if (name) {
                    const scopedFuncName = deep ? `${this.resolveScopedName(scopeNode, name)}`: `${this.getScopedName(name, scopeNode)}-${node.range[0]}`;
                    dependencies.add(scopedFuncName);
                }
                break;
            case 'CallExpression':
                name = this.getFunctionName(node.base);
                if (name) {
                    let scopedName = ''
                    if (node.base.type == 'MemberExpression') {
                        scopedName = this.getScopedName(this.getFunctionName(node.base, true) as string, scopeNode);
                    } else {
                        scopedName = `${this.getScopedName(name, scopeNode)}-${node.range[0]}`;
                    }
                    const funcDeclareName = deep ? `${this.resolveScopedName(scopeNode, name)}`: `${scopedName}`;
                    dependencies.add(funcDeclareName);
                }
                break;
            case 'MemberExpression':
                name = this.getFunctionName(node, true);
                if (name) {
                    const scopedFuncName = `${this.getScopedName(name, scopeNode)}`;
                    dependencies.add(scopedFuncName);
                }
                break;
            case 'StringLiteral':
            case 'NumericLiteral':
            case 'BooleanLiteral':
                name = node.type as string;
                dependencies.add(name);
                break;
            case 'TableConstructorExpression':
                for (const field of node.fields) {
                    if (field.type === 'TableKey') {
                        this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, field.key, content, startPos, statement, deep);
                        this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, field.value, content, startPos, statement, deep);
                    } else if (field.type === 'TableValue') {
                        this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, field.value, content, startPos, statement, deep);
                    }
                }
                if (node.fields.length <= 0) {
                    name = node.type as string;
                    dependencies.add(name);
                }
                break;
            case 'BinaryExpression':
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node.left, content, startPos, statement, deep);
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node.right, content, startPos, statement, deep);
                break;
            case 'UnaryExpression':
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node.argument, content, startPos, statement, deep);
                break;
            case 'LogicalExpression':
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node.left, content, startPos, statement, deep);
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node.right, content, startPos, statement, deep);
                break;
            case 'AssignmentStatement':
                let scopedName = '';
                for (const variable of node.variables) {
                    if (variable.type === 'Identifier') {
                        name = variable.name as string;
                        scopedName = `${this.getScopedName(name, scopeNode)}-${node.range[0]}`;
                        dependencies.add(scopedName);
                    } else if (variable.type === 'MemberExpression') {
                        name = this.getFunctionName(variable) as string;
                        if (name) {
                            scopedName = this.getScopedName(this.getFunctionName(variable, true) as string, scopeNode);
                            dependencies.add(scopedName);
                        }
                    }
                }
                break;
            case 'LocalStatement':
                const isFileLocal = scopeNode.currentDepth == 0;
                if (isFileLocal) {
                    this.enterNewScope(definitionMap, dependencyGraph, keywordTree, scopeNode, node, content, startPos, statement, isFileLocal);
                }
                for (const variable of node.variables) {
                    if (variable.type === 'Identifier') {
                        const scopedName = this.getScopedName(variable.name, scopeNode);
                        dependencies.add(scopedName);
                    }
                }
                if (isFileLocal) {
                    this.exitScope(scopeNode);
                }
                break;
            default:
                for (const key in node) {
                    if (this.dependencyFilters.has(key)) {
                        continue;
                    }
                    if (node.hasOwnProperty(key) && typeof node[key] === 'object') {
                        if (Array.isArray(node[key])) {
                            for (const child of node[key]) {
                                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, child, content, startPos, statement, deep);
                            }
                        } else {
                            this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node[key], content, startPos, statement, deep);
                        }
                    }
                }
                break;
        }
        if (isBlockNode) {
            this.exitScope(scopeNode);
        }
    }

    private createTreeNode(keywordTree: ContextTreeNode, scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any, name: string, scopedName: string): ContextTreeNode | undefined {
        const contextItem = this.createContextItemForLua(current, current.type, scopedName, false, undefined, content, startPos, statement);
        const contextTreeNode = {
            value: contextItem,
            children: []
        }
        keywordTree?.children.push(contextTreeNode);
        if (!scopeNode.current?.hasVariable(name)) {
            scopeNode.current?.addVariable(name, scopedName);
        }
        return contextTreeNode;
    }

    private checkDefineNode(definitionMap: DefinitionMapType, scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any, name: string, scopedName: string) {
        if (!definitionMap.has(scopedName)) {
            const item = this.createContextItemForLua(current, current.type, scopedName, false, undefined, content, startPos, statement);
            definitionMap.set(scopedName, item);
        }
        if (!scopeNode.current?.hasVariable(name)) {
            scopeNode.current?.addVariable(name, scopedName);
        }
    }

    private resolveScopedName(scopeNode: ScopeNode, name: string): string {
        if (scopeNode.current?.hasVariable(name)) {
            const scopedName = scopeNode.current.getScopedName(name)!;
            if (this.isDefined(scopedName)) {
                return scopedName;
            }
        }
        let parentScope = scopeNode.current?.parent;
        while (parentScope) {
            if (parentScope.hasVariable(name)) {
                const scopedName = parentScope.getScopedName(name)!;
                if (this.isDefined(scopedName)) {
                    return scopedName;
                }
            }
            parentScope = parentScope.parent;
        }
        let scopedName = '';
        const child = scopeNode.stack.length > 1 ? scopeNode.stack[1].get(scopeNode.filePath) : undefined;
        if (child) {
            if (child.hasVariable(name)) {
                scopedName = `global>${scopeNode.filePath}>${name}`;
            } else {
                scopedName = `global>${name}`;    
            }
        } else {
            scopedName = `global>${name}`;
        }
        return scopedName;
    }

    private isDefined(scopedName: string): boolean {
        const parts = scopedName.split('>').filter(part => part !== '');
        if (parts.length > 0 && !parts[parts.length - 1].includes("-")) {
            return true;
        } else {
            return false;
        }
    }

    private isRangeChange(current: any): boolean {
        if (this.isScopeNode(current, '') || current.type == 'LocalStatement' || current.type == 'AssignmentStatement' || current.type == 'CallStatement' || current.type == 'Identifier') {
            return true;
        } else {
            return false;
        }
    }
    
    private isScopeNode(node: any, key: string): boolean {
        if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
            return key != 'parameters';
        } else {
            return this.isBlockScopeNode(node);
        }
    }

    private isBlockScopeNode(node: any): boolean {
        return [
            'DoStatement',        // do...end 块
            'IfClause',         // if 语句块
            'ElseifClause',     // elseif 语句块
            'ElseClause',       // else 语句块
            'ForNumericStatement', // 数值 for 循环
            'ForGenericStatement', // 泛型 for 循环
            'WhileStatement',      // while 循环
            'RepeatStatement'      // repeat...until 循环
        ].includes(node.type);
    }

    private isFileLocalVariable(scopeNode: ScopeNode, node: any): boolean {
        if (scopeNode.currentDepth === 0) {
            if (node.type === 'LocalStatement') {
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }

    private isLocalFunction(scopeNode: ScopeNode, node: any): boolean {
        if (scopeNode.currentDepth === 0) {
            if ((node.type == 'FunctionDeclaration' || node.type == 'FunctionExpression') && node.isLocal) {
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }

    private enterNewScope(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, contextTree: ContextTreeNode | undefined,
        scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any, isFileLocal: boolean = false) {
        const scopeType = this.isBlockScopeNode(current) ? 'block' : 'function';
        let scopeName = isFileLocal ? scopeNode.filePath : this.getScopeName(current, startPos, scopeType);
        let newScopes: Map<string, Scope>;
        scopeNode.currentDepth += 1;
        if (scopeNode.currentDepth >= scopeNode.stack.length) {
            newScopes = new Map();
            scopeNode.stack.push(newScopes);
        }
        newScopes = scopeNode.stack[scopeNode.currentDepth];
        let newScope = newScopes.get(scopeName);
        if (!newScope) {
            newScope = new Scope(scopeName, scopeNode.current, scopeType === 'block');
            newScopes.set(scopeName, newScope);
            newScope = newScopes.get(scopeName);
        }
        scopeNode.current = newScope;
        if (scopeType === 'block') {
            this.processBlockScopeVariables(definitionMap, dependencyGraph, contextTree, scopeNode, current, content, startPos, statement);
        }
    }

    private getScopeName(node: any, startPos: number, scopeType: 'function' | 'block'): string {
        let scopeName: string;
        const start: number = node.range[0] + startPos;
        const end: number = node.range[1] + startPos;
        if (scopeType === 'function') {
            scopeName = `${this.getFunctionName(node.identifier)}` || `${start}~${end}`;
        } else {
            scopeName = `${start}~${end}`;
        }
        return scopeName;
    }

    private getScopedName(name: string, scopeNode: ScopeNode): string {
        let parentName = `${scopeNode.current?.fullName}`;
        return `${parentName}>${name}`;
    }

    private exitScope(scopeNode: ScopeNode) {
        if (scopeNode.stack.length > 1) {
            scopeNode.current = scopeNode.current?.parent;
            scopeNode.currentDepth -= 1;
        }
    }

    protected getFunctionName(node: any, declare: boolean = false): string | null {
        if (!node) {
            return null;
        }
        switch (node.type) {
            case 'Identifier':
                return node.name;
            case 'MemberExpression':
                let name = this.getFunctionName(node.base, declare);
                if (declare && node.base.type == 'Identifier') {
                    name = `${name}-${node.range[0]}`
                }
                return `${name}>${this.getFunctionName(node.identifier)}`;
            case 'CallExpression':
                return this.getFunctionName(node.base);
            default:
                return null;
        }
    }
}