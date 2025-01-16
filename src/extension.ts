// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { validateDocument } from "./validate/validateOptions";
import { createLegend, getSemanticProvider } from "./semanticHelper";
import { validateChecksum } from "./validate/validateChecksum";
import { SettingsInlayHintsProvider } from "./inlayHintHelper";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const diagnosticCollection =
        vscode.languages.createDiagnosticCollection("eac-logs");
    const legend = createLegend([
        "validChecksum",
        "invalidChecksum",
        "feature",
        "feature-value",
        "feature-value-hint",
    ]);
    const semanticProvider: vscode.DocumentSemanticTokensProvider = {
        provideDocumentSemanticTokens(document, token) {
            return getSemanticProvider(document, legend);
        },
    };

    const inlayProvider = new SettingsInlayHintsProvider();

    const validate = (document: vscode.TextDocument) => {
        const firstLine = document.lineAt(0).text;
        if (firstLine.startsWith("Exact Audio Copy ")) {
            vscode.languages.setTextDocumentLanguage(document, "eac-log");
            validateDocument(document, diagnosticCollection);
            validateChecksum(document, diagnosticCollection);
        }
    };

    // Trigger validation when a document is opened
    vscode.workspace.onDidOpenTextDocument((document) => {
        validate(document);
    });

    // Trigger validation when a document is changed
    vscode.workspace.onDidChangeTextDocument((event) => {
        validate(event.document);
    });

    // Clear diagnostics when a document is closed
    vscode.workspace.onDidCloseTextDocument((document) => {
        diagnosticCollection.delete(document.uri);
    });

    // Validate all open documents when the extension is activated
    vscode.workspace.textDocuments.forEach((document) => {
        validate(document);
    });

    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider(
            { language: "eac-log" },
            semanticProvider,
            legend
        )
    );
    context.subscriptions.push(
        vscode.languages.registerInlayHintsProvider(
            { language: "eac-log" }, // Match files
            inlayProvider
        )
    );
}

// This method is called when your extension is deactivated
export function deactivate() {}
