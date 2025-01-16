import * as vscode from "vscode";
import { Rijndael } from "../rijndael/Rijndael";

const EAC_KEY =
    "9378716cf13e4265ae55338e940b376184da389e50647726b35f6f341ee3efd9";

interface CheckData {
    unsignedText?: string;
    oldChecksum?: string;
}

interface CheckResult {
    message: "invalid" | "passed" | "failed";
    start?: number;
    end?: number;
    expected?: string;
    calculated?: string;
}

export const validateChecksum = (
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection
) => {
    const res = checkChecksum(document);
    if (res.message === "failed") {
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(
                document.positionAt(res.start!),
                document.positionAt(res.end!)
            ),
            `Checksum: expected '${res.expected}', calculated '${res.calculated}'.`,
            vscode.DiagnosticSeverity.Error
        );
        collection.set(document.uri, [
            ...(collection.get(document.uri) || []),
            diagnostic,
        ]);
    } else if (res.message === "invalid") {
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(0, 100)
            ),
            `Checksum: missing or invalid.`,
            vscode.DiagnosticSeverity.Error
        );
        collection.set(document.uri, [
            ...(collection.get(document.uri) || []),
            diagnostic,
        ]);
    }
};

export const checkChecksum = (document: vscode.TextDocument): CheckResult => {
    const file = document.getText();
    const match = file.match(/==== (.+)? (?<check>[0-9A-Z]{64}) ====/);
    let checkData: CheckData = {
        unsignedText: undefined,
        oldChecksum: undefined,
    };
    if (!match) {
        return {
            message: "invalid",
        };
    }

    const matched = file.replace(/==== (.+)? ([0-9A-Z]{64}) ====/g, "");
    checkData.unsignedText = matched;
    checkData.oldChecksum = match.groups!["check"];

    if (
        checkData.oldChecksum === undefined ||
        checkData.unsignedText === undefined
    ) {
        return { message: "invalid" };
    } else {
        const calculated = checksum(checkData.unsignedText);
        if (calculated === checkData.oldChecksum) {
            return { message: "passed" };
        } else {
            return {
                message: "failed",
                calculated: calculated,
                expected: checkData.oldChecksum,
                start: file.indexOf(match[0]),
                end: file.indexOf(match[0]) + match[0].length,
            };
        }
    }
};

const bufferToHex = (buffer: any) => {
    return [...new Uint8Array(buffer)]
        .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
        .join("");
};

const checksum = (text: string): string => {
    // Ignore newlines
    text = text.replace(/\r\n/g, "").replace(/\n/g, "");

    // Fuzzing reveals BOMs are also ignored
    text = text.replaceAll("\ufeff", "").replaceAll("\ufffe", "");

    // Setup Rijndael-256 with a 256-bit blocksize
    const key = Buffer.from(EAC_KEY, "hex");
    const block_size = 256 / 8;
    const cipher = new Rijndael(key);

    // Encode the text as UTF-16-LE
    const plaintext = Buffer.from(text, "utf16le");
    //console.log(plaintext);

    // The IV is all zeroes so we don't have to handle it
    let checksum = Buffer.alloc(block_size, 0);

    // Process it block-by-block
    for (let i = 0; i < plaintext.length; i += block_size) {
        // Zero-pad the last block, if necessary
        const plaintext_block = Buffer.alloc(block_size, 0);
        plaintext.copy(plaintext_block, 0, i, i + block_size);

        // CBC mode (XOR the previous ciphertext block into the plaintext)
        const cbc_plaintext = Buffer.alloc(block_size, 0);
        for (let j = 0; j < block_size; j++) {
            cbc_plaintext[j] = checksum[j] ^ plaintext_block[j];
        }

        // New checksum is the ciphertext.
        checksum = Buffer.from(cipher.encrypt(cbc_plaintext));
    }

    // Textual checksum is just the hex representation
    return bufferToHex(checksum);
};
