class Heap<T> {
    private data: T[] = [];
    private compare: (a: T, b: T) => number;

    constructor(compare: (a: T, b: T) => number) {
        this.compare = compare; // compare(a,b) > 0 表示 a 优先级更高
    }

    insert(val: T): void {
        this.data.push(val);
        this.heapifyUp(this.size() - 1);
    }

    extract(): T | undefined {
        if (this.size() === 0) return undefined;
        const top = this.data[0];
        this.data[0] = this.data.pop()!;
        this.heapifyDown(0);
        return top;
    }

    private heapifyUp(index: number): void {
        while (index > 0) {
            const parentIdx = Math.floor((index - 1) / 2);
            if (this.compare(this.data[index], this.data[parentIdx]) <= 0) break;
            [this.data[index], this.data[parentIdx]] = [this.data[parentIdx], this.data[index]];
            index = parentIdx;
        }
    }

    private heapifyDown(index: number): void {
        const size = this.size();
        while (true) {
            let childIdx = 2 * index + 1;
            if (childIdx >= size) break;
            if (childIdx + 1 < size && this.compare(this.data[childIdx+1], this.data[childIdx]) > 0) {
                childIdx++;
            }
            if (this.compare(this.data[childIdx], this.data[index]) <= 0) break;
            [this.data[index], this.data[childIdx]] = [this.data[childIdx], this.data[index]];
            index = childIdx;
        }
    }

    size(): number { return this.data.length; }
    peek(): T | undefined { return this.data[0]; }
}

export class PriorityQueue<T> {
    private heap: Heap<{ value: T; priority: number }>;

    constructor() {
        this.heap = new Heap((a, b) => b.priority - a.priority); // 最大堆（数值越大优先级越高）
    }

    enqueue(value: T, priority: number): void {
        this.heap.insert({ value, priority });
    }

    dequeue(): T | undefined {
        return this.heap.extract()?.value;
    }

    peek(): T | undefined {
        return this.heap.peek()?.value;
    }

    size(): number {
        return this.heap.size();
    }

    isEmpty(): boolean {
        return this.heap.size() == 0;
    }
}