import * as vscode from "vscode";

const validSettings: Record<string, string> = {
    "Read mode": "Secure",
    "Utilize accurate stream": "Yes",
    "Defeat audio cache": "Yes",
    "Make use of C2 pointers": "No",

    "Fill up missing offset samples with silence": "Yes",
    "Delete leading and trailing silent blocks": "No",
    "Null samples used in CRC calculations": "Yes",
};

export class SettingsInlayHintsProvider implements vscode.InlayHintsProvider {
    provideInlayHints(
        document: vscode.TextDocument,
        range: vscode.Range,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.InlayHint[]> {
        const hints: vscode.InlayHint[] = [];

        hintExpectedValue(document, range, hints);
        hintAlbum(document.lineAt(4), hints);

        return hints;
    }
}

const hintAlbum = (line: vscode.TextLine, hints: vscode.InlayHint[]) => {
    // Match the format: artist / album
    const match = line.text.match(/^(.*)\s+\/\s+(.*)$/);
    if (match) {
        const artist = match[1].trim();
        const album = match[2].trim();

        // Add inlay hint for the artist
        const artistHint = new vscode.InlayHint(
            new vscode.Position(line.lineNumber, 0),
            `Artist: `,
            vscode.InlayHintKind.Type
        );
        artistHint.tooltip = `The name of the artist is "${artist}".`;

        // Add inlay hint for the album
        const albumHint = new vscode.InlayHint(
            new vscode.Position(line.lineNumber, line.text.indexOf("/") + 2),
            `Album: `,
            vscode.InlayHintKind.Type
        );
        albumHint.tooltip = `The name of the album is "${album}".`;

        hints.push(artistHint, albumHint);
    }
};

const hintExpectedValue = (
    document: vscode.TextDocument,
    range: vscode.Range,
    hints: vscode.InlayHint[]
) => {
    for (let i = range.start.line; i <= range.end.line; i++) {
        const line = document.lineAt(i).text;
        const match = line.match(/^(.*?):\s+(.*)$/);

        if (match) {
            const settingName = match[1].trim();
            const settingValue = match[2].trim();

            if (validSettings[settingName]) {
                // Add an inline hint for the setting value
                const valueHint = new vscode.InlayHint(
                    new vscode.Position(i, match[1].length + 2),
                    `${validSettings[settingName]}:`,
                    vscode.InlayHintKind.Parameter
                );
                hints.push(valueHint);
            }
        }
    }
};
