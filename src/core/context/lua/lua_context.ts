import { ContextItem, ContextTreeNode } from '../../ai_model/base/ai_types';
import { ContextBase } from '../../context/base/context_base';
import { Scope } from '../../types/scope'

export type DependencyGraphType = Map<string, Set<string>>;
export type DefinitionMapType = Map<string, ContextItem>;

export interface ScopeNode {
    stack: Map<string, Scope>[];
    current: Scope | undefined;
    currentDepth: number;
}

export class LuaContext extends ContextBase {
    private filters = new Set();
    private dependencyFilters = new Set();
    private forNumericFilters = new Set();
    constructor() {
        super();
        let filters = ['type', 'range', 'loc', 'identifier'];
        filters.forEach(filter => this.filters.add(filter));
        filters = ['type', 'range', 'loc'];
        filters.forEach(filter => this.dependencyFilters.add(filter));
        filters = ['variable', 'body', 'loc', 'range', 'type'];
        filters.forEach(filter => this.forNumericFilters.add(filter));
    }

    public buildTree(contextTree: ContextTreeNode | undefined, scopeNode: ScopeNode, root: any, content: string, startPos: number) {
        const traverse = (parentTree: ContextTreeNode | undefined, current: any, statement: any) => {
            const currentTree = this.processNodeForDependencies(undefined, undefined, parentTree, scopeNode, current, content, startPos, statement);
            if (this.isScopeNode(current)) {
                this.enterNewScope(undefined, undefined, parentTree, scopeNode, current, content, startPos, statement);
            }
            for (const key in current) {
                if (this.filters.has(key)) {
                    continue;
                }
                if (current.hasOwnProperty(key) && typeof current[key] === 'object') {
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
                }
            }
            if (this.isScopeNode(current)) {
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
            if (this.isScopeNode(current)) {
                this.enterNewScope(definitionMap, dependencyGraph, undefined, scopeNode, current, content, startPos, statement);
            }
            for (const key in current) {
                if (this.filters.has(key)) {
                    continue;
                }
                if (current.hasOwnProperty(key) && typeof current[key] === 'object') {
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
                }
            }
            if (this.isScopeNode(current)) {
                this.exitScope(scopeNode);
            }
            this.processNodeForDependencies(definitionMap, dependencyGraph, undefined, scopeNode, current, content, startPos, statement);
        };
        traverse(root, undefined);
    }

    protected processNodeForDependencies(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, 
            scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any): ContextTreeNode | undefined {
        let contextTree: ContextTreeNode | undefined = keywordTree;
        switch (current.type) {
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
                    for (const key in current) {
                        if (this.forNumericFilters.has(key)) {
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

    protected processCallDependencies(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, 
        scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any): ContextTreeNode | undefined {
        const funcName = this.getFunctionName(current.base);
        if (!funcName) {
            return;
        }
        const scopedFuncName = this.resolveScopedName(scopeNode, funcName);
        const funcDeclareName = this.getScopedName(funcName, scopeNode) + '-declare';
        if (definitionMap && dependencyGraph) {
            this.checkDefineNode(definitionMap, scopeNode, current, content, startPos, statement, funcName, funcDeclareName);
            if (!dependencyGraph.has(funcDeclareName)) {
                dependencyGraph.set(funcDeclareName, new Set());
            }
            const depSet = dependencyGraph.get(funcDeclareName)!; 
            depSet.add(scopedFuncName);
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
                if (this.isScopeNode(current)) {
                    this.exitScope(scopeNode);
                }
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
            for (const variable of current.variables) {
                if (variable.type === 'Identifier') {
                    const scopedName = this.getScopedName(variable.name, scopeNode);
                    leftVars.push(scopedName);
                    this.checkDefineNode(definitionMap, scopeNode, current, content, startPos, statement, variable.name, scopedName);
                }
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
            for (const variable of current.variables) {
                if (variable.type === 'Identifier') {
                    const scopedName = this.getScopedName(variable.name, scopeNode);
                    this.createTreeNode(keywordTree as ContextTreeNode, scopeNode, variable, content, startPos, statement, variable.name, scopedName);
                }
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
                    scopedName = this.resolveScopedName(scopeNode, name);
                    leftVars.push(scopedName);
                } else if (variable.type === 'MemberExpression') {
                    name = this.getFunctionName(variable) as string;
                    if (name) {
                        scopedName = this.resolveScopedName(scopeNode, name);
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
                    scopedName = this.resolveScopedName(scopeNode, name);
                } else if (variable.type === 'MemberExpression') {
                    name = this.getFunctionName(variable) as string;
                    if (name) {
                        scopedName = this.resolveScopedName(scopeNode, name);
                    }
                }
                this.createTreeNode(keywordTree as ContextTreeNode, scopeNode, variable, content, startPos, statement, name, scopedName);
            }
            return keywordTree;
        }
    }

    protected collectDependenciesFromExpression(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, keywordTree: ContextTreeNode | undefined, dependencies: Set<string>,
        scopeNode: ScopeNode, node: any, content: string, startPos: number, statement: any) {
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
                    const scopedFuncName = this.resolveScopedName(scopeNode, name);
                    dependencies.add(scopedFuncName);
                }
                break;
            case 'CallExpression':
                const funcName = this.getFunctionName(node.base);
                if (funcName) {
                    const funcDeclareName = this.getScopedName(funcName, scopeNode) + '-declare';
                    dependencies.add(funcDeclareName);
                }
                break;
            case 'MemberExpression':
                name = this.getFunctionName(node);
                if (name) {
                    const scopedFuncName = this.resolveScopedName(scopeNode, name);
                    dependencies.add(scopedFuncName);
                }
                break;
            case 'StringLiteral':
            case 'NumericLiteral':
            case 'BooleanLiteral':
                break;
            case 'TableConstructorExpression':
                for (const field of node.fields) {
                    if (field.type === 'TableKey') {
                        this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, field.key, content, startPos, statement);
                        this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, field.value, content, startPos, statement);
                    } else if (field.type === 'TableValue') {
                        this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, field.value, content, startPos, statement);
                    }
                }
                break;
            case 'BinaryExpression':
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node.left, content, startPos, statement);
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node.right, content, startPos, statement);
                break;
            case 'UnaryExpression':
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node.argument, content, startPos, statement);
                break;
            case 'LogicalExpression':
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node.left, content, startPos, statement);
                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node.right, content, startPos, statement);
                break;
            default:
                for (const key in node) {
                    if (this.dependencyFilters.has(key)) {
                        continue;
                    }
                    if (node.hasOwnProperty(key) && typeof node[key] === 'object') {
                        if (Array.isArray(node[key])) {
                            for (const child of node[key]) {
                                this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, child, content, startPos, statement);
                            }
                        } else {
                            this.collectDependenciesFromExpression(definitionMap, dependencyGraph, keywordTree, dependencies, scopeNode, node[key], content, startPos, statement);
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

    private getScopedName(name: string, scopeNode: ScopeNode): string {
        return `${scopeNode.current?.fullName}>${name}`;
    }

    private resolveScopedName(scopeNode: ScopeNode, name: string): string {
        if (scopeNode.current?.hasVariable(name)) {
            return scopeNode.current.getScopedName(name)!;
        }
        let parentScope = scopeNode.current?.parent;
        while (parentScope) {
            if (parentScope.hasVariable(name)) {
                return parentScope.getScopedName(name)!;
            }
            parentScope = parentScope.parent;
        }
        const globalScopes = scopeNode.stack[0];
        const globalScope = globalScopes.get('global') as Scope;
        if (globalScope.hasVariable(name)) {
            return globalScope.getScopedName(name)!;
        }
        return `global>${name}`;
    }

    // private isLocalVariable(name: string, scopeNode: ScopeNode, scopeIndex: number): boolean {
    //     let current: Scope | undefined = scopeNode.current;
    //     while (current) {
    //         if (current.hasVariable(name)) {
    //             const scopeName = current.getScopedName(name) as string;
    //             const parts = scopeName.split('>').filter(part => part !== '');
    //             return parts.length - 2 >= scopeIndex;
    //         }
    //         current = current.parent;
    //     }
    //     return false;
    // }

    private isRangeChange(current: any): boolean {
        if (this.isScopeNode(current) || current.type == 'LocalStatement' || current.type == 'AssignmentStatement' || 'CallStatement') {
            return true;
        } else {
            return false;
        }
    }
    
    private isScopeNode(node: any): boolean {
        return node.type === 'FunctionDeclaration' || 
               node.type === 'FunctionExpression' ||
               this.isBlockScopeNode(node);
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

    private enterNewScope(definitionMap: DefinitionMapType | undefined, dependencyGraph: DependencyGraphType | undefined, contextTree: ContextTreeNode | undefined,
        scopeNode: ScopeNode, current: any, content: string, startPos: number, statement: any) {
        const scopeType = this.isBlockScopeNode(current) ? 'block' : 'function';
        let scopeName = this.getScopeName(current, startPos, scopeType);
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

    private exitScope(scopeNode: ScopeNode) {
        if (scopeNode.stack.length > 1) {
            scopeNode.current = scopeNode.current?.parent;
            scopeNode.currentDepth -= 1;
        }
    }

    protected getFunctionName(node: any): string | null {
        if (!node) {
            return null;
        }
        switch (node.type) {
            case 'Identifier':
                return node.name;
            case 'MemberExpression':
                return `${this.getFunctionName(node.base)}>${this.getFunctionName(node.identifier)}`;
            case 'CallExpression':
                return this.getFunctionName(node.base);
            default:
                return null;
        }
    }
}