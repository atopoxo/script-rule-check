export class Scope {
    public name: string;
    public parent: Scope | undefined;
    private variables: Map<string, string>; // 变量名 -> 带作用域前缀的名称
    public fullName: string;
    public isBlockScope: boolean;

    constructor(name: string, parent: Scope | undefined, isBlockScope: boolean = false) {
        this.name = name;
        this.parent = parent;
        this.variables = new Map();
        this.fullName = parent ? `${parent.fullName}>${name}` : name;
        this.isBlockScope = isBlockScope;
    }

    addVariable(name: string, scopedName: string) {
        this.variables.set(name, scopedName);
    }

    hasVariable(name: string): boolean {
        return this.variables.has(name);
    }

    getScopedName(name: string): string | undefined {
        return this.variables.get(name);
    }
}