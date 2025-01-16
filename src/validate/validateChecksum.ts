import * as vscode from "vscode";
import { Rijndael } from "../rijndael/Rijndael";

const EAC_KEY =
    "9378716cf13e4265ae55338e940b376184da389e50647726b35f6f341ee3efd9";

interface CheckData {
    unsignedText?: string;
    oldChecksum?: string;
}

export const validateChecksum = (
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection
): boolean => {
    const file = document.getText();
    const match = file.match(/==== (.+)? ([0-9A-Z]{64}) ====/);
    let checkData: CheckData = {
        unsignedText: undefined,
        oldChecksum: undefined,
    };
    if (!match) {
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(0, file.length > 100 ? 100 : file.length)
            ),
            `Checksum: missing or invalid in the file.`,
            vscode.DiagnosticSeverity.Error
        );
        collection.set(document.uri, [
            ...(collection.get(document.uri) || []),
            diagnostic,
        ]);
        return false;
    }

    const matched = file.replaceAll(/==== (.+)? ([0-9A-Z]{64}) ====/g, "");
    checkData.unsignedText = matched;
    checkData.oldChecksum = match[2];

    if (
        checkData.oldChecksum === undefined ||
        checkData.unsignedText === undefined
    ) {
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(0, file.length > 100 ? 100 : file.length)
            ),
            `Checksum: missing or invalid in the file.`,
            vscode.DiagnosticSeverity.Error
        );
        collection.set(document.uri, [
            ...(collection.get(document.uri) || []),
            diagnostic,
        ]);
        return false;
    } else {
        const calculated = checksum(file);
        if (calculated === checkData.oldChecksum) {
            return true;
        } else {
            // Add checksum mismatch error
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(
                    document.positionAt(file.indexOf(match[0])),
                    document.positionAt(
                        file.indexOf(match[0]) + match[0].length
                    )
                ),
                `Checksum: expected '${checkData.oldChecksum}', calculated '${calculated}'.`,
                vscode.DiagnosticSeverity.Error
            );
            collection.set(document.uri, [
                ...(collection.get(document.uri) || []),
                diagnostic,
            ]);
            return false;
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
    text = text.replaceAll(/\r/g, "").replaceAll(/\n/g, "");

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
