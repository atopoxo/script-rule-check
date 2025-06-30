class TrieNode<T> {
    children: Map<string, TrieNode<T>>;
    value?: T;

    constructor() {
        this.children = new Map();
    }
}

export class Trie<T> {
    private root: TrieNode<T>;

    constructor() {
        this.root = new TrieNode<T>();
    }

    public insert(key: string, value: T): void {
        const parts = key.split('>').filter(part => part !== '');
        let currentNode = this.root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!currentNode.children.has(part)) {
                currentNode.children.set(part, new TrieNode<T>());
            }
            currentNode = currentNode.children.get(part)!;
        }
        currentNode.value = value;
    }

    public query(key: string): T[] {
        const parts = key.split('>').filter(part => part !== '');
        let currentNode = this.root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!currentNode.children.has(part)) {
                return [];
            }
            currentNode = currentNode.children.get(part)!;
        }
        const results: T[] = [];
        this.collectValues(currentNode, results);
        return results;
    }

    private collectValues(node: TrieNode<T>, results: T[]): void {
        if (node.value !== undefined) {
            results.push(node.value);
        }
        for (const child of node.children.values()) {
            this.collectValues(child, results);
        }
    }
}