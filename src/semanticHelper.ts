import * as vscode from "vscode";
import { checkChecksum } from "./validate/validateChecksum";

export const createLegend = (
    tokenTypes: string[]
): vscode.SemanticTokensLegend => {
    return new vscode.SemanticTokensLegend(tokenTypes);
};

export const getSemanticProvider = (
    document: vscode.TextDocument,
    legend: vscode.SemanticTokensLegend
): vscode.SemanticTokens => {
    const builder = new vscode.SemanticTokensBuilder(legend);

    checksumBuilder(document, builder);
    featureBuilder(document, builder);
    albumBuilder(document, builder);
    trackBuilder(document, builder);
    ctdbStatusBuilder(document, builder);

    return builder.build();
};

const checksumBuilder = (
    document: vscode.TextDocument,
    builder: vscode.SemanticTokensBuilder
) => {
    const file = document.getText();
    const match = file.match(/\r?\n\r?\n==== (.*) ([A-Z0-9]+) ====/);

    if (match) {
        const checksumRangeStart = document.positionAt(file.indexOf(match[2]));
        const checksumRangeEnd = document.positionAt(
            file.indexOf(match[2]) + match[2].length
        );

        // Validate checksum
        const { message } = checkChecksum(document);

        if (message === "passed") {
            // Add valid checksum token
            builder.push(
                new vscode.Range(checksumRangeStart, checksumRangeEnd),
                "validChecksum"
            );
        } else {
            // Add invalid checksum token
            builder.push(
                new vscode.Range(checksumRangeStart, checksumRangeEnd),
                "invalidChecksum"
            );
        }
    }
};

const featureBuilder = (
    document: vscode.TextDocument,
    builder: vscode.SemanticTokensBuilder
) => {
    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;

        if (line === "End of status report") {
            break;
        }
        // Match the setting line
        const match = line.match(/^(.*?):\s+(.*)$/);
        if (match) {
            const keyRangeStart = new vscode.Position(i, 0);
            const keyRangeEnd = new vscode.Position(i, match[1].length);
            const valueRangeStart = new vscode.Position(i, match[1].length + 2);
            const valueRangeEnd = new vscode.Position(i, line.length);
            if (match[1].trim() === "Used drive") {
                builder.push(
                    new vscode.Range(keyRangeStart, keyRangeEnd),
                    "feature"
                );
                const drive = match[2].match(/(.+)(?=Adapter:)/);
                if (drive) {
                    const driveLength = drive[0].trim().length;
                    builder.push(
                        new vscode.Range(
                            valueRangeStart,
                            valueRangeStart.translate(0, driveLength)
                        ),
                        "feature-value-hint"
                    );
                    builder.push(
                        new vscode.Range(
                            valueRangeStart.translate(0, driveLength),
                            valueRangeEnd
                        ),
                        "feature-value"
                    );
                }
            } else if (
                match[1].trim() === "Read offset correction" ||
                match[1].trim() === "Overread into Lead-In and Lead-Out"
            ) {
                builder.push(
                    new vscode.Range(keyRangeStart, keyRangeEnd),
                    "feature"
                );
                builder.push(
                    new vscode.Range(valueRangeStart, valueRangeEnd),
                    "feature-value-hint"
                );
            } else {
                builder.push(
                    new vscode.Range(keyRangeStart, keyRangeEnd),
                    "feature"
                );
                builder.push(
                    new vscode.Range(valueRangeStart, valueRangeEnd),
                    "feature-value"
                );
            }
        }
    }
};

const albumBuilder = (
    document: vscode.TextDocument,
    builder: vscode.SemanticTokensBuilder
) => {
    const split = document.lineAt(4).text.indexOf(" / ");
    builder.push(
        new vscode.Range(
            new vscode.Position(4, 0),
            new vscode.Position(4, split)
        ),
        "feature-value"
    );
    builder.push(
        new vscode.Range(
            new vscode.Position(4, split + 3),
            document.lineAt(4).range.end
        ),
        "feature-value"
    );
};

const trackBuilder = (
    document: vscode.TextDocument,
    builder: vscode.SemanticTokensBuilder
) => {
    const totalLines = document.lineCount;
    let isProcessingTracks = false;
    let currentTrackTestCRC = "";
    let currentTrackCopyCRC = "";
    let trackStartLine = -1;

    for (let i = 0; i < totalLines; i++) {
        const line = document.lineAt(i).text;
        if (line === "") {
            continue;
        }

        // Handle final status messages
        if (
            line === "All tracks accurately ripped" ||
            line === "No errors occurred"
        ) {
            builder.push(
                new vscode.Range(
                    new vscode.Position(i, 0),
                    document.lineAt(i).range.end
                ),
                "validChecksum"
            );
            continue;
        }

        if (line === "End of status report") {
            break;
        }

        // Detect start of tracks section
        if (!isProcessingTracks && /^Track\s+\d+/.test(line)) {
            isProcessingTracks = true;
        }

        // Skip lines before the first track
        if (!isProcessingTracks) {
            continue;
        }

        // Handle new track - reset CRC values
        const trackMatch = line.match(/^Track\s+(\d+)/);
        if (trackMatch) {
            // If we have CRC values from previous track, process them before moving to new track
            if (currentTrackTestCRC && currentTrackCopyCRC) {
                markCRCStatus(
                    document,
                    builder,
                    trackStartLine,
                    i - 1,
                    currentTrackTestCRC,
                    currentTrackCopyCRC
                );
            }

            // Reset for new track
            currentTrackTestCRC = "";
            currentTrackCopyCRC = "";
            trackStartLine = i;

            builder.push(
                new vscode.Range(
                    new vscode.Position(i, 0),
                    new vscode.Position(i, line.length)
                ),
                "feature-value"
            );
        }

        // Handle filenames
        const filenameMatch = line.match(/^\s*Filename\s+(.+\.wav)$/);
        if (filenameMatch) {
            builder.push(
                new vscode.Range(
                    new vscode.Position(i, line.indexOf(filenameMatch[1])),
                    new vscode.Position(i, line.length)
                ),
                "feature-value"
            );
        }

        // Store CRC values
        const crcMatch = line.match(/^\s*(Test|Copy) CRC\s+([A-F0-9]+)$/);
        if (crcMatch) {
            const [_, crcType, crcValue] = crcMatch;
            const start = line.indexOf(crcValue);

            if (crcType === "Test") {
                currentTrackTestCRC = crcValue;
            } else if (crcType === "Copy") {
                currentTrackCopyCRC = crcValue;
            }
        }

        // Handle status messages
        if (line.match(/(Copy OK|Accurately ripped)/)) {
            const start = line.indexOf(line.trim());
            builder.push(
                new vscode.Range(
                    new vscode.Position(i, start),
                    new vscode.Position(i, line.length)
                ),
                "feature"
            );
        }
    }

    // Process the last track if it exists
    if (currentTrackTestCRC && currentTrackCopyCRC && trackStartLine !== -1) {
        markCRCStatus(
            document,
            builder,
            trackStartLine,
            totalLines - 1,
            currentTrackTestCRC,
            currentTrackCopyCRC
        );
    }
};

// Helper function to mark CRC status for a track
const markCRCStatus = (
    document: vscode.TextDocument,
    builder: vscode.SemanticTokensBuilder,
    startLine: number,
    endLine: number,
    testCRC: string,
    copyCRC: string
) => {
    if (testCRC === copyCRC) {
        for (let i = startLine; i <= endLine; i++) {
            const line = document.lineAt(i).text;
            const crcMatch = line.match(/^\s*(Test|Copy) CRC\s+([A-F0-9]+)$/);

            if (crcMatch) {
                const [_, crcType, crcValue] = crcMatch;
                const start = line.indexOf(crcValue);

                builder.push(
                    new vscode.Range(
                        new vscode.Position(i, start),
                        new vscode.Position(i, start + crcValue.length)
                    ),
                    "validChecksum"
                );
            }
        }
        return; // CRCs match, keep the existing validChecksum marking
    }

    // CRCs don't match, find and mark both CRCs as invalid
    for (let i = startLine; i <= endLine; i++) {
        const line = document.lineAt(i).text;
        const crcMatch = line.match(/^\s*(Test|Copy) CRC\s+([A-F0-9]+)$/);

        if (crcMatch) {
            const [_, crcType, crcValue] = crcMatch;
            const start = line.indexOf(crcValue);

            builder.push(
                new vscode.Range(
                    new vscode.Position(i, start),
                    new vscode.Position(i, start + crcValue.length)
                ),
                "invalidChecksum"
            );
        }
    }
};

const ctdbStatusBuilder = (
    document: vscode.TextDocument,
    builder: vscode.SemanticTokensBuilder
) => {
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
            builder.push(
                new vscode.Range(
                    new vscode.Position(i, 0),
                    new vscode.Position(i, line.length)
                ),
                "feature"
            );
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
            const [_, trackNum, matches, total, status] = statusMatch;

            // Mark track number
            const trackStart = line.indexOf(trackNum);
            builder.push(
                new vscode.Range(
                    new vscode.Position(i, trackStart),
                    new vscode.Position(i, trackStart + trackNum.length)
                ),
                "feature-value"
            );

            // Mark matches ratio (e.g., "11/11")
            const ratioText = `(${matches}/${total})`;
            const ratioStart = line.indexOf(ratioText);
            builder.push(
                new vscode.Range(
                    new vscode.Position(i, ratioStart),
                    new vscode.Position(i, ratioStart + ratioText.length)
                ),
                "validChecksum"
            );

            // Mark status text
            const statusStart = line.indexOf(status);
            builder.push(
                new vscode.Range(
                    new vscode.Position(i, statusStart),
                    new vscode.Position(i, statusStart + status.length)
                ),
                "feature"
            );
        }

        // Optional: Handle non-accurate rips or other statuses
        const nonAccurateMatch = line.match(
            /^\s*(\d+)\s*\|\s*\((\d+)\/(\d+)\)\s*(Not accurately ripped)/
        );
        if (nonAccurateMatch) {
            const [_, trackNum, matches, total, status] = nonAccurateMatch;

            // Mark track number
            const trackStart = line.indexOf(trackNum);
            builder.push(
                new vscode.Range(
                    new vscode.Position(i, trackStart),
                    new vscode.Position(i, trackStart + trackNum.length)
                ),
                "feature-value"
            );

            // Mark matches ratio with warning
            const ratioText = `(${matches}/${total})`;
            const ratioStart = line.indexOf(ratioText);
            builder.push(
                new vscode.Range(
                    new vscode.Position(i, ratioStart),
                    new vscode.Position(i, ratioStart + ratioText.length)
                ),
                "invalidChecksum"
            );

            // Mark status text
            const statusStart = line.indexOf(status);
            builder.push(
                new vscode.Range(
                    new vscode.Position(i, statusStart),
                    new vscode.Position(i, statusStart + status.length)
                ),
                "invalidChecksum"
            );
        }
    }
};
