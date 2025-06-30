import { ContextItem } from '../../ai_model/base/ai_types';
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
    private whiteList: string[] = [];
    constructor() {
        super();
        const filters = ['type', 'range', 'loc', 'identifier'];
        filters.forEach(filter => this.filters.add(filter));
        this.whiteList = ['identifier'];
    }
    public buildDependencyGraph(root: any, scopeNode: ScopeNode, dependencyGraph: DependencyGraphType, definitionMap: DefinitionMapType, content: string, startPos: number) {
        const traverse = (parent: any, key: string, current: any, statement: any) => {
            if (current.type === 'FunctionDeclaration' || current.type === 'FunctionExpression') {
                this.enterNewScope(current, startPos, scopeNode, 'function');
                statement = current;
            } else if (this.isBlockScopeNode(current)) {
                this.enterNewScope(current, startPos, scopeNode, 'block');
                statement = current;
            }
            for (const key in current) {
                if (this.filters.has(key)) {
                    continue;
                }
                if (current.hasOwnProperty(key) && typeof current[key] === 'object') {
                    if (Array.isArray(current[key])) {
                        for (const child of current[key]) {
                            if (child) {
                                traverse(current, key, child, statement);
                            }
                        }
                    } else {
                        if (current[key]) {
                            traverse(current, key, current[key], statement);
                        }
                    }
                }
            }
            if (this.isScopeNode(current)) {
                this.exitScope(scopeNode);
            }
            for (key in this.whiteList) {
                if (current[key]) {
                    this.processNodeForDependencies(current, key, current[key], scopeNode, dependencyGraph, definitionMap, content, startPos, statement);
                }
            }
            this.processNodeForDependencies(parent, key, current, scopeNode, dependencyGraph, definitionMap, content, startPos, statement);
        };
        traverse(undefined, '', root, undefined);
    }

    private isScopeNode(node: any): boolean {
        return node.type === 'FunctionDeclaration' || 
               node.type === 'FunctionExpression' ||
               this.isBlockScopeNode(node);
    }

    private isBlockScopeNode(node: any): boolean {
        return [
            'DoStatement',        // do...end 块
            'IfStatement',         // if 语句块
            'ElseifStatement',     // elseif 语句块
            'ElseStatement',       // else 语句块
            'ForNumericStatement', // 数值 for 循环
            'ForGenericStatement', // 泛型 for 循环
            'WhileStatement',      // while 循环
            'RepeatStatement'      // repeat...until 循环
        ].includes(node.type);
    }

    private enterNewScope(node: any, startPos: number, scopeNode: ScopeNode, scopeType: 'function' | 'block') {
        let scopeName = this.getScopeName(node, startPos, scopeType);
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
            this.processBlockScopeVariables(node, scopeNode);
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

    private processBlockScopeVariables(node: any, scopeNode: ScopeNode) {
        switch (node.type) {
            case 'ForNumericStatement':
                const varName = node.variable.name;
                const scopedName = this.getScopedName(varName, scopeNode);
                scopeNode.current?.addVariable(varName, scopedName);
                break;
            case 'ForGenericStatement':
                for (const variable of node.variables) {
                    if (variable.type === 'Identifier') {
                        const varName = variable.name;
                        const scopedName = this.getScopedName(varName, scopeNode);
                        scopeNode.current?.addVariable(varName, scopedName);
                    }
                }
                break;
        }
    }

    private exitScope(scopeNode: ScopeNode) {
        if (scopeNode.stack.length > 1) {
            scopeNode.current = scopeNode.current?.parent;
            scopeNode.currentDepth -= 1;
        }
    }

    private getScopedName(name: string, scopeNode: ScopeNode): string {
        return `${scopeNode.current?.fullName}>${name}`;
    }

    protected processNodeForDependencies(parent: any, key: string, current: any, scopeNode: ScopeNode, dependencyGraph: DependencyGraphType, definitionMap: DefinitionMapType, content: string, startPos: number, statement: any) {
        switch (current.type) {
            case 'Identifier':
                this.processIdentifier(parent, key, current, scopeNode, definitionMap, content, startPos, statement);
                break;
            case 'CallExpression':
                this.processCallDependencies(current, scopeNode, dependencyGraph);
                break;
            case 'FunctionDeclaration':
            case 'FunctionExpression':
                this.processFunctionDependencies(current, scopeNode, dependencyGraph, definitionMap, content, startPos);
                break;
            case 'AssignmentStatement':
                this.processAssignmentDependencies(current, scopeNode, dependencyGraph);
                break;
            case 'LocalStatement':
                this.processLocalDependencies(current, scopeNode, dependencyGraph, definitionMap, content, startPos);
                break;
        }
    }

    protected processIdentifier(parent: any, key: string, current: any, scopeNode: ScopeNode, definitionMap: DefinitionMapType, content: string, startPos: number, statement: any) {
        let name = ''
        switch (parent.type) {
            case 'MemberExpression':
                name = this.getFunctionName(parent) as string;
                break;
            case 'FunctionDeclaration':
            case 'FunctionExpression':
                if (key == 'identifier') {
                    name = this.getScopeName(parent, startPos, 'function');
                } else {
                    name = this.getFunctionName(current) as string;
                }
                break;
            default:
                name = this.getFunctionName(current) as string;
                break;
        }
        let scopedName = '';
        switch (parent.type) {
            case 'LocalStatement':
                scopedName = this.getScopedName(name, scopeNode);
                break;
            case 'FunctionDeclaration':
            case 'FunctionExpression':
                if (key == 'identifier') {
                    scopedName = this.getScopedName(name, scopeNode);
                } else {
                    scopedName = this.resolveScopedName(scopeNode, name);    
                }
                break;
            default:
                scopedName = this.resolveScopedName(scopeNode, name);
                break;
        }
        if (!definitionMap.has(scopedName)) {
            const item = this.createContextItemForLua(current, current.type, scopedName, false, undefined, content, startPos, statement);
            definitionMap.set(scopedName, item);
        }
        if (!scopeNode.current?.hasVariable(name)) {
            scopeNode.current?.addVariable(name, scopedName);
        }
    }

    protected processCallDependencies(current: any, scopeNode: ScopeNode, dependencyGraph: DependencyGraphType) {
        const funcName = this.getFunctionName(current.base);
        if (!funcName) {
            return;
        }
        const scopedFuncName = this.resolveScopedName(scopeNode, funcName);
        const deps = new Set<string>();
        for (const arg of current.arguments) {
            this.collectDependenciesFromExpression(arg, deps);
        }
        if (deps.size > 0) {
            if (!dependencyGraph.has(scopedFuncName)) {
                dependencyGraph.set(scopedFuncName, new Set());
            }
            const depSet = dependencyGraph.get(scopedFuncName)!;
            for (const dep of deps) {
                const resolvedDep = this.resolveScopedName(scopeNode, dep);
                depSet.add(resolvedDep);
            }
        }
    }

    protected processFunctionDependencies(current: any, scopeNode: ScopeNode, dependencyGraph: DependencyGraphType, definitionMap: DefinitionMapType, content: string, startPos: number) {
        const funcName = this.getScopeName(current, startPos, 'function');
        const scopedFuncName = this.getScopedName(funcName, scopeNode);
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
            this.enterNewScope(current, startPos, scopeNode, 'function');
            const bodyDeps = new Set<string>();
            const scopeIndex = scopeNode.currentDepth;
            this.collectFunctionBodyDependencies(current.body, startPos, bodyDeps, scopeNode, scopeIndex);
            if (bodyDeps.size > 0) {
                if (!dependencyGraph.has(scopedFuncName)) {
                    dependencyGraph.set(scopedFuncName, new Set());
                }
                const depSet = dependencyGraph.get(scopedFuncName)!;
                for (const dep of bodyDeps) {
                    const resolvedDep = this.resolveScopedName(scopeNode, dep);
                    depSet.add(resolvedDep);
                }
            }
            if (this.isScopeNode(current)) {
                this.exitScope(scopeNode);
            }
        }
    }

    protected processLocalDependencies(current: any, scopeNode: ScopeNode, dependencyGraph: DependencyGraphType, definitionMap: DefinitionMapType, content: string, startPos: number) {
        const leftVars: string[] = [];
        for (const variable of current.variables) {
            if (variable.type === 'Identifier') {
                const scopedName = this.getScopedName(variable.name, scopeNode);
                leftVars.push(scopedName);
            }
        }
        const rightDeps = new Set<string>();
        if (current.init) {
            for (const expr of current.init) {
                this.collectDependenciesFromExpression(expr, rightDeps);
            }
        }
        for (const leftVar of leftVars) {
            if (rightDeps.size > 0) {
                if (!dependencyGraph.has(leftVar)) {
                    dependencyGraph.set(leftVar, new Set());
                }
                const deps = dependencyGraph.get(leftVar)!;
                for (const dep of rightDeps) {
                    const resolvedDep = this.resolveScopedName(scopeNode, dep);
                    deps.add(resolvedDep);
                }
            }
        }
    }

    protected processAssignmentDependencies(current: any, scopeNode: ScopeNode, dependencyGraph: DependencyGraphType) {
        const leftVars: string[] = [];
        for (const variable of current.variables) {
            if (variable.type === 'Identifier') {
                const scopedName = this.resolveScopedName(scopeNode, variable.name);
                leftVars.push(scopedName);
            } else if (variable.type === 'MemberExpression') {
                const name = this.getFunctionName(variable);
                if (name) {
                    const scopedName = this.resolveScopedName(scopeNode, name);
                    leftVars.push(scopedName);
                }
            }
        }
        const rightDeps = new Set<string>();
        for (const expr of current.init) {
            this.collectDependenciesFromExpression(expr, rightDeps);
        }
        for (const leftVar of leftVars) {
            if (rightDeps.size > 0) {
                if (!dependencyGraph.has(leftVar)) {
                    dependencyGraph.set(leftVar, new Set());
                }
                const deps = dependencyGraph.get(leftVar)!;
                for (const dep of rightDeps) {
                    const resolvedDep = this.resolveScopedName(scopeNode, dep);
                    deps.add(resolvedDep);
                }
            }
        }
    }

    protected collectDependenciesFromExpression(node: any, dependencies: Set<string>) {
        if (!node) {
            return;
        }
        switch (node.type) {
            case 'Identifier':
                dependencies.add(node.name);
                break;
            case 'CallExpression':
                const funcName = this.getFunctionName(node.base);
                if (funcName) {
                    dependencies.add(funcName);
                }
                for (const arg of node.arguments) {
                    this.collectDependenciesFromExpression(arg, dependencies);
                }
                break;
            case 'MemberExpression':
                const name = this.getFunctionName(node);
                if (name) {
                    dependencies.add(name);
                }
                break;
            case 'StringLiteral':
            case 'NumericLiteral':
            case 'BooleanLiteral':
                break;
            case 'TableConstructorExpression':
                for (const field of node.fields) {
                    if (field.type === 'TableKey') {
                        this.collectDependenciesFromExpression(field.key, dependencies);
                        this.collectDependenciesFromExpression(field.value, dependencies);
                    } else if (field.type === 'TableValue') {
                        this.collectDependenciesFromExpression(field.value, dependencies);
                    }
                }
                break;
            case 'BinaryExpression':
                this.collectDependenciesFromExpression(node.left, dependencies);
                this.collectDependenciesFromExpression(node.right, dependencies);
                break;
            case 'UnaryExpression':
                this.collectDependenciesFromExpression(node.argument, dependencies);
                break;
            case 'LogicalExpression':
                this.collectDependenciesFromExpression(node.left, dependencies);
                this.collectDependenciesFromExpression(node.right, dependencies);
                break;
            default:
                for (const key in node) {
                    if (node.hasOwnProperty(key) && typeof node[key] === 'object') {
                        if (Array.isArray(node[key])) {
                            for (const child of node[key]) {
                                this.collectDependenciesFromExpression(child, dependencies);
                            }
                        } else {
                            this.collectDependenciesFromExpression(node[key], dependencies);
                        }
                    }
                }
                break;
        }
    }

     private collectFunctionBodyDependencies(node: any, startPos: number, dependencies: Set<string>, scopeNode: ScopeNode, scopeIndex: number) {
        if (!node) {
            return;
        }
        const isBlockNode = this.isBlockScopeNode(node);
        if (isBlockNode) {
            this.enterNewScope(node, startPos, scopeNode, 'block');
        }
        switch (node.type) {
            case 'Identifier':
                if (!this.isLocalVariable(node.name, scopeNode, scopeIndex)) {
                    dependencies.add(node.name);
                }
                break;      
            case 'CallExpression':
                const funcName = this.getFunctionName(node.base);
                if (funcName && !this.isLocalVariable(funcName, scopeNode, scopeIndex)) {
                    dependencies.add(funcName);
                }
                for (const arg of node.arguments) {
                    this.collectFunctionBodyDependencies(arg, startPos, dependencies, scopeNode, scopeIndex);
                }
                break;
            case 'MemberExpression':
                const name = this.getFunctionName(node);
                if (name && !this.isLocalVariable(name, scopeNode, scopeIndex)) {
                    dependencies.add(name);
                }
                break;
            case 'AssignmentStatement':
            case 'LocalStatement':
                if (node.init) {
                    for (const expr of node.init) {
                        this.collectFunctionBodyDependencies(expr, startPos, dependencies, scopeNode, scopeIndex);
                    }
                }
                break;
            default:
                for (const key in node) {
                    if (node.hasOwnProperty(key) && typeof node[key] === 'object') {
                        if (Array.isArray(node[key])) {
                            for (const child of node[key]) {
                                this.collectFunctionBodyDependencies(child, startPos, dependencies, scopeNode, scopeIndex);
                            }
                        } else {
                            this.collectFunctionBodyDependencies(node[key], startPos, dependencies, scopeNode, scopeIndex);
                        }
                    }
                }
                break;
        }
        if (isBlockNode) {
            this.exitScope(scopeNode);
        }
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

    private isLocalVariable(name: string, scopeNode: ScopeNode, scopeIndex: number): boolean {
        let current: Scope | undefined = scopeNode.current;
        while (current) {
            if (current.hasVariable(name)) {
                const scopeName = current.getScopedName(name) as string;
                const parts = scopeName.split('>').filter(part => part !== '');
                return parts.length - 2 >= scopeIndex;
            }
            current = current.parent;
        }
        return false;
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