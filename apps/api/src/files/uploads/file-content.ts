import { createHash } from "node:crypto";

import { ContractException } from "../../http/contracts";
import { maxPrivateFileBytes } from "../storage/private-object-store";

export function safeFilename(value: string): string {
    const name = value
        .replace(/\\/gu, "/")
        .split("/")
        .at(-1)
        ?.split("")
        .filter((char) => {
            const code = char.charCodeAt(0);
            return code > 31 && code !== 127;
        })
        .join("")
        .trim();
    if (!name || name === "." || name === ".." || Buffer.byteLength(name, "utf8") > 240) {
        throw new ContractException("INVALID_FILENAME", 400);
    }
    try {
        encodeURIComponent(name);
    } catch {
        throw new ContractException("INVALID_FILENAME", 400);
    }
    return name;
}

export function sha256(bytes: Buffer): string {
    return createHash("sha256").update(bytes).digest("hex");
}

export function detectMediaType(
    bytes: Buffer,
): "application/pdf" | "image/jpeg" | "image/png" | "text/plain" | null {
    if (bytes.length < 1 || bytes.length > maxPrivateFileBytes) return null;
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return "image/png";
    if (
        bytes.length >= 4 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes.at(-2) === 0xff &&
        bytes.at(-1) === 0xd9
    )
        return "image/jpeg";
    if (bytes.subarray(0, 5).toString("ascii") === "%PDF-" && bytes.includes(Buffer.from("%%EOF")))
        return "application/pdf";
    const decoded = new TextDecoder("utf-8", { fatal: true });
    try {
        const text = decoded.decode(bytes);
        if (
            [...text].every((char) => {
                const code = char.charCodeAt(0);
                return code > 31 || code === 9 || code === 10 || code === 13;
            })
        )
            return "text/plain";
    } catch {
        /* Binary content. */
    }
    return null;
}
