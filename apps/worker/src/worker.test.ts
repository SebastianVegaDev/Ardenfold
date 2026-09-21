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
        const messages: string[] = [];

        const worker = createWorker({
            info: (message: string): void => {
                messages.push(message);
            },
        });

        expect(worker.isRunning()).toBe(false);

        worker.start();

        expect(worker.isRunning()).toBe(true);
        expect(messages).toEqual(['{"level":"info","service":"worker","event":"started"}']);

        worker.stop("SIGTERM");

        expect(worker.isRunning()).toBe(false);
        expect(messages).toEqual([
            '{"level":"info","service":"worker","event":"started"}',
            '{"level":"info","service":"worker","event":"shutdown","signal":"SIGTERM"}',
        ]);
    });
});
