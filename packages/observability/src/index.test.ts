import { Writable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
    createStructuredLogger,
    getCorrelationId,
    resolveCorrelationId,
    runWithCorrelationContext,
} from "./index.js";

describe("correlation context", () => {
    it("accepts UUID request identifiers and generates replacements for unsafe values", () => {
        const identifier = "a8bd24ba-8f34-4a0e-9dd1-32db354ceac6";

        expect(resolveCorrelationId(identifier.toUpperCase())).toBe(identifier);
        expect(resolveCorrelationId("attacker-controlled")).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
    });

    it("makes correlation context available to asynchronous work", async () => {
        await runWithCorrelationContext(
            { correlationId: "a8bd24ba-8f34-4a0e-9dd1-32db354ceac6" },
            async () => {
                await Promise.resolve();

                expect(getCorrelationId()).toBe("a8bd24ba-8f34-4a0e-9dd1-32db354ceac6");
            },
        );
    });
});

describe("structured logging", () => {
    it("redacts credentials while retaining useful event fields", () => {
        const write = vi.fn<(chunk: string) => void>();
        const destination = new Writable({
            write(chunk: Buffer, _encoding, callback): void {
                write(chunk.toString());
                callback();
            },
        });
        const logger = createStructuredLogger("test", destination);

        logger.info({
            event: "request.completed",
            headers: {
                authorization: "Bearer top-secret",
                cookie: "session=top-secret",
            },
            password: "top-secret",
        });

        const output = write.mock.calls[0]?.[0] ?? "";

        expect(output).not.toContain("top-secret");
        expect(output).toContain("[REDACTED]");
    });
});
