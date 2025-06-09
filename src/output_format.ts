import * as vscode from 'vscode';

export class CheckRule {
    constructor(
        public id: string,
        public taskName: string,
        public taskPath: string
    ) {}
}

export class ModelInfo {
    constructor(
        public id: string,
        public name: string,
        public type: string,
        public key: string
    ) {}
}

export class ReferenceInfo {
    constructor(
        public type: string,
        public name: string,
        public paths?: string[],
        public content?: string,
        public range?: any
    ) {}
}

export class ReferenceOption {
    constructor(
        public type: string,
        public id: string,
        public name: string,
        public describe: string,
        public icon?: string,
        public reference?: ReferenceInfo,
        public children?: ReferenceOption[]
    ) {}
}

export interface CheckResult {
    rule: CheckRule;
    tips: string;
    path: string;
    lines: number[];
    info: string;
}

export class FileNode {
    public results: CheckResult[] = [];
    constructor(
        public name: string,
        public path: string
    ) {}
}

export class DirectoryNode {
    constructor(
        public name: string,
        public path: string,
        public children: Map<string, DirectoryNode | FileNode> = new Map()
    ) {}
}

export class DirectoryTreeItem extends vscode.TreeItem {
    constructor(public readonly directoryNode: DirectoryNode, public readonly tag: string) {
        super(directoryNode.name, vscode.TreeItemCollapsibleState.Collapsed);
        // this.resourceUri = vscode.Uri.file(directoryNode.path);
        // this.contextValue = 'directory';
        this.tooltip = directoryNode.path;
        this.iconPath = vscode.ThemeIcon.Folder;
        this.id = `${this.tag}_${directoryNode.path.replace(/[\/\\]/g, '_')}`;
    }
}

export class FileTreeItem extends vscode.TreeItem {
    constructor(public readonly fileNode: FileNode, public readonly tag: string) {
        super(fileNode.name, fileNode.results.length > 0 
            ? vscode.TreeItemCollapsibleState.Collapsed 
            : vscode.TreeItemCollapsibleState.None);
        // this.resourceUri = vscode.Uri.file(fileNode.path);
        // this.contextValue = 'file';
        this.tooltip = fileNode.path;
        this.iconPath = vscode.ThemeIcon.File;
        this.id = `${this.tag}_${fileNode.path.replace(/[\/\\]/g, '_')}`;
    }
}

export class CheckResultTreeItem extends vscode.TreeItem {
    constructor(public readonly result: CheckResult) {
        super(`报错类型:'${result.tips}', 报错行:'${result.lines.join(',')}', 报错信息:'${result.info}'`,
            vscode.TreeItemCollapsibleState.None);
        
        const severity = result.tips.includes('error') ? 'error' : 'warning';
        this.iconPath = new vscode.ThemeIcon(
            severity,
            new vscode.ThemeColor(severity === 'error' ? 'list.errorForeground' : 'list.warningForeground')
        );
        this.command = {
            command: 'extension.openFileWithEncoding',
            title: '跳转到错误位置',
            arguments: [
                // vscode.Uri.file(result.path),
                result.path,
                new vscode.Range(
                    new vscode.Position(result.lines[0] - 1, 0),
                    new vscode.Position(result.lines[0] - 1, 0)
                )
            ]
        };
    }
}