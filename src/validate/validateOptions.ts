import * as vscode from "vscode";

const validSettings: Record<string, string> = {
    "Read mode": "Secure",
    "Utilize accurate stream": "Yes",
    "Defeat audio cache": "Yes",
    "Make use of C2 pointers": "No",
    "Fill up missing offset samples with silence": "Yes",
    "Delete leading and trailing silent blocks": "No",
    "Null samples used in CRC calculations": "Yes",
    "Gap handling": "Appended to previous track",
};

export const validateDocument = (
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection
) => {
    if (!document.fileName.endsWith(".log")) {
        return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const reportedErrors = new Set<string>(); // Track settings to avoid duplicate errors

    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;

        // Match the setting line
        const match = line.match(/^(.*?):\s+(.*)$/);
        if (match) {
            const settingName = match[1].trim();
            const settingValue = match[2].trim();

            if (
                validSettings[settingName] &&
                validSettings[settingName] !== settingValue &&
                !reportedErrors.has(settingName) // Avoid duplicate errors
            ) {
                // Highlight invalid value
                const range = new vscode.Range(
                    new vscode.Position(i, match[1].length + 2),
                    new vscode.Position(i, line.length)
                );
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        `Invalid value '${settingValue}' for setting '${settingName}'.`,
                        vscode.DiagnosticSeverity.Warning
                    )
                );
                reportedErrors.add(settingName); // Mark this setting as reported
            }
        }
    }

    collection.set(document.uri, diagnostics);
};
