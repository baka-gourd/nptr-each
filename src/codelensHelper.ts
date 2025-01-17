import * as vscode from "vscode";

export class CodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];

        if (document.lineCount >= 5) {
            const line = document.lineAt(4);
            const info = new vscode.CodeLens(line.range, {
                title: getDetail(document),
                tooltip: "Go to end",
                command: "each.goToEnd",
                arguments: [document.uri],
            });

            const end = document.lineAt(document.lineCount - 2);
            const toStart = new vscode.CodeLens(end.range, {
                title: "Back to top",
                tooltip: "Back to top",
                command: "each.goToStart",
                arguments: [document.uri],
            });

            codeLenses.push(info);
            codeLenses.push(toStart);
        }

        return codeLenses;
    }
}

const getDetail = (document: vscode.TextDocument): string => {
    const totalLines = document.lineCount;
    let isProcessingTracks = false;

    for (let i = 0; i < totalLines; i++) {
        const line = document.lineAt(i).text;

        // Skip empty lines
        if (line.trim() === "") {
            continue;
        }

        // Handle header line
        if (line.includes("Track | CTDB Status")) {
            isProcessingTracks = true;
            continue;
        }

        if (!isProcessingTracks) {
            continue;
        }

        // Parse track status lines
        const statusMatch = line.match(
            /^\s*(\d+)\s*\|\s*\((\d+)\/(\d+)\)\s*(Accurately ripped)/
        );
        if (statusMatch) {
            continue;
        }

        // Optional: Handle non-accurate rips or other statuses
        const nonAccurateMatch = line.match(
            /^\s*(\d+)\s*\|\s*\((\d+)\/(\d+)\)\s*(Differs in.+)/
        );
        if (nonAccurateMatch) {
            return "Not accurately ripped";
        }
    }

    return "Accurately ripped";
};
