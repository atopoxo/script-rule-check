import { List } from "lodash";

export class Scope {
    public name: string;
    public parent: Scope | undefined;
    private variables: Map<string, Array<{ scopedName: string; change: boolean }>>; // 变量名 -> 带作用域前缀的名称
    public fullName: string;
    public isBlockScope: boolean;

    constructor(name: string, parent: Scope | undefined, isBlockScope: boolean = false) {
        this.name = name;
        this.parent = parent;
        this.variables = new Map();
        this.fullName = parent ? `${parent.fullName}>${name}` : name;
        this.isBlockScope = isBlockScope;
    }

    addVariable(name: string, scopedName: string, change: boolean) {
        if (!this.variables.has(name)) {
            this.variables.set(name, [{ scopedName, change }]);
        } else {
            const items = this.variables.get(name)!;
            if (items.some(item => item.scopedName === scopedName)) {
                return;
            }
            items.push({ scopedName, change });
        }
    }

    hasVariable(name: string): boolean {
        return this.variables.has(name);
    }

    getScopedLikelyName(name: string, node: any): string | undefined {
        const items = this.variables.get(name);
        if (!items || items.length === 0) {
            return undefined;
        }

        const threshold = node.range[0];
        let bestName: string | undefined = undefined;
        let maxNum = -1; // 初始化为 -1，确保 0 也能被选中
        for (let i = items.length - 1; i >= 0; i--) {
            const change = items[i].change;
            if (!change) {
                continue;
            }
            const scopedName = items[i].scopedName;
            const lastDashIndex = scopedName.lastIndexOf('-');
            let num = 0;
            if (lastDashIndex !== -1) {
                const suffix = scopedName.slice(lastDashIndex + 1);
                const num = Number(suffix);
                if (!Number.isInteger(num) || num < 0) {
                    continue;
                }
            }
            if (num < threshold && num > maxNum) {
                maxNum = num;
                bestName = scopedName;
                break;
            }
        }

        return bestName;
    }

    hasVariableLikely(baseName: string): string | null {
        if (this.hasVariable(baseName)) {
            return baseName;
        }

        // 2. 构造正则：匹配 baseName-数字，注意转义特殊字符
        const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^${escapedBase}-(\\d+)$`);

        let maxNum = -1;
        let bestMatch: string | null = null;

        // 3. 遍历 scope 中所有变量名
        for (const varName of this['variables'].keys()) {
            const match = varName.match(regex);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) {
                    maxNum = num;
                    bestMatch = varName;
                }
            }
        }

        return bestMatch; // 可能为 null
    }
}