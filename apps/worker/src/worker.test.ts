import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWorker } from "./worker.js";

describe("worker lifecycle", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("starts and shuts down gracefully", () => {
        const messages: Readonly<Record<string, unknown>>[] = [];

        const worker = createWorker({
            info: (fields: Readonly<Record<string, unknown>>): void => {
                messages.push(fields);
            },
        });

        expect(worker.isRunning()).toBe(false);

        worker.start();

        expect(worker.isRunning()).toBe(true);
        expect(messages).toEqual([{ event: "worker.started" }]);

        worker.stop("SIGTERM");

        expect(worker.isRunning()).toBe(false);
        expect(messages).toEqual([
            { event: "worker.started" },
            { event: "worker.shutdown", signal: "SIGTERM" },
        ]);
    });
});
