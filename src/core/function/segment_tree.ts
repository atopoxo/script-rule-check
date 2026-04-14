class SegmentTreeNode {
    left: number;
    right: number;
    value: number | null;
    leftChild: SegmentTreeNode | null;
    rightChild: SegmentTreeNode | null;

    constructor(left: number, right: number, value: number | null) {
        this.left = left;
        this.right = right;
        this.value = value;
        this.leftChild = null;
        this.rightChild = null;
    }
}

export class SegmentTree {
    private root: SegmentTreeNode;

    constructor(left: number, right: number, initialValue: number | null = null) {
        this.root = new SegmentTreeNode(left, right, initialValue);
    }

    public update(left: number, right: number, value: number): void {
        this.updateNode(this.root, left, right, value);
    }

    public getRange(left: number, right: number, value: number): [number, number][] {
        return this.queryNode(this.root, left, right, value);
    }

    private updateNode(node: SegmentTreeNode, left: number, right: number, value: number): void {
        if (left === node.left && node.right === right) {
            node.value = value;
            node.leftChild = null;
            node.rightChild = null;
            return;
        }
        const mid = Math.floor((node.left + node.right) / 2);
        this.pushDown(node, mid);
        if (right <= mid) {
            this.updateNode(node.leftChild!, left, right, value);
        } else if (left >= mid) {
            this.updateNode(node.rightChild!, left, right, value);
        } else {
            this.updateNode(node.leftChild!, left, mid, value);
            this.updateNode(node.rightChild!, mid, right, value);
        }
        this.updateNodeValue(node);
    }

    private pushDown(node: SegmentTreeNode, mid: number): void {
        if (!node.leftChild && !node.rightChild) {
            node.leftChild = new SegmentTreeNode(node.left, mid, node.value);
            node.rightChild = new SegmentTreeNode(mid, node.right, node.value);
            node.value = null;
        }
    }

    private updateNodeValue(node: SegmentTreeNode): void {
        if (node.leftChild && node.rightChild) {
            if (node.leftChild.value !== null && 
                node.rightChild.value !== null && 
                node.leftChild.value === node.rightChild.value) {
                this.updateNodeValue(node.leftChild);
                this.updateNodeValue(node.rightChild);
                node.value = node.leftChild.value;
                node.leftChild = null;
                node.rightChild = null;
            } else {
                node.value = null;
            }
        }
    }

    private queryNode(node: SegmentTreeNode, left: number, right: number, value: number): [number, number][] {
        if (node.value === value) {
            return [[left, right]];
        }
        let leftRes: [number, number][] = [];
        let rightRes: [number, number][] = [];
        const mid = Math.floor((node.left + node.right) / 2);
        if (right <= mid) {
            if (node.leftChild) {
                leftRes = this.queryNode(node.leftChild, left, right, value);
            } else {
                if (node.value === value) {
                    leftRes = [[left, right]];
                }
            }
        } else if (left >= mid) {
            if (node.rightChild) {
                rightRes = this.queryNode(node.rightChild, left, right, value);
            } else {
                if (node.value === value) {
                    rightRes = [[left, right]];
                }
            }
        } else {
            if (node.leftChild) {
                leftRes = this.queryNode(node.leftChild, left, mid, value);
            } else {
                if (node.value === value) {
                    leftRes = [[left, mid]];
                }
            }
            if (node.rightChild) {
                rightRes = this.queryNode(node.rightChild, mid, right, value);
            } else {
                if (node.value === value) {
                    rightRes = [[mid, right]];
                }
            }
        }
        return this.mergeRanges(leftRes, rightRes);
    }

    private mergeRanges(leftRanges: [number, number][], rightRanges: [number, number][]): [number, number][] {
        if (leftRanges.length === 0) {
            return rightRanges;
        }
        if (rightRanges.length === 0) {
            return leftRanges;
        }
        const lastLeft = leftRanges[leftRanges.length - 1];
        const firstRight = rightRanges[0];
        if (lastLeft[1] === firstRight[0]) {
            return [
                ...leftRanges.slice(0, -1),
                [lastLeft[0], firstRight[1]],
                ...rightRanges.slice(1)
            ];
        } else {
            return [...leftRanges, ...rightRanges];
        }
    }
}