import * as vscode from 'vscode';
import * as path from 'path';
import { ReferenceItem } from './chat_manager';

export class ReferenceSystem {
    static async addCodeReference(): Promise<ReferenceItem | undefined> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const document = editor.document;
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        if (!symbols || symbols.length === 0) {
            vscode.window.showInformationMessage('No symbols found in this file');
            return;
        }

        // Flatten symbols (including nested ones)
        const allSymbols: vscode.DocumentSymbol[] = [];
        const flattenSymbols = (symbols: vscode.DocumentSymbol[]) => {
            for (const symbol of symbols) {
                allSymbols.push(symbol);
                if (symbol.children && symbol.children.length > 0) {
                    flattenSymbols(symbol.children);
                }
            }
        };
        flattenSymbols(symbols);

        // Create quick pick items
        const items = allSymbols.map(symbol => ({
            label: symbol.name,
            description: symbol.detail,
            detail: `Line ${symbol.range.start.line + 1}`,
            symbol
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a function or symbol to reference'
        });

        if (selected) {
            return {
                type: 'code',
                path: document.uri.fsPath,
                name: `${path.basename(document.fileName)}: ${selected.symbol.name}`,
                range: selected.symbol.range
            };
        }
    }

    static async addFileReference(): Promise<ReferenceItem | undefined> {
        const files = await vscode.workspace.findFiles('**/*');
        const items = files.map(file => ({
            label: path.basename(file.fsPath),
            description: path.dirname(file.fsPath),
            file
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a file to reference'
        });

        if (selected) {
            return {
                type: 'file',
                path: selected.file.fsPath,
                name: path.basename(selected.file.fsPath)
            };
        }
    }

    static async addFolderReference(): Promise<ReferenceItem | undefined> {
        const folders = await this.getWorkspaceFolders();
        const items = folders.map(folder => ({
            label: path.basename(folder),
            description: path.dirname(folder),
            folder
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a folder to reference'
        });

        if (selected) {
            return {
                type: 'folder',
                path: selected.folder,
                name: path.basename(selected.folder)
            };
        }
    }

    private static async getWorkspaceFolders(): Promise<string[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        const folders: string[] = [];
        const processFolder = async (folderPath: string) => {
            folders.push(folderPath);
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folderPath));
            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory) {
                    await processFolder(path.join(folderPath, name));
                }
            }
        };

        for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            await processFolder(workspaceFolder.uri.fsPath);
        }

        return folders;
    }
}