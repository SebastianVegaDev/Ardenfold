import { describe, expect, it } from "vitest";

import { ContractException } from "../../http/contracts";
import { detectMediaType, safeFilename, sha256 } from "./file-content";

describe("private file content validation", () => {
    it("keeps only a safe display name and rejects control-only names", () => {
        expect(safeFilename("../directory\\report.pdf")).toBe("report.pdf");
        expect(() => safeFilename("\r\n")).toThrow(ContractException);
        expect(() => safeFilename("..\\..")).toThrow(ContractException);
        expect(() => safeFilename("\ud800.txt")).toThrow(ContractException);
    });

    it("recognizes the allowed content and rejects executable or malformed bytes", () => {
        expect(detectMediaType(Buffer.from("%PDF-1.7\n%%EOF"))).toBe("application/pdf");
        expect(detectMediaType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]))).toBe("image/png");
        expect(detectMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBe("image/jpeg");
        expect(detectMediaType(Buffer.from("hello\n", "utf8"))).toBe("text/plain");
        expect(detectMediaType(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0]))).toBeNull();
        expect(detectMediaType(Buffer.alloc(10_485_761))).toBeNull();
        expect(sha256(Buffer.from("abc"))).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    });
});
