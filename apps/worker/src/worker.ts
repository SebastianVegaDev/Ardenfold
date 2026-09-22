import {
    createStructuredLogger,
    resolveCorrelationId,
    runWithCorrelationContext,
} from "@ardenfold/observability";

export type ShutdownSignal = "SIGINT" | "SIGTERM";

export type WorkerLogger = Readonly<{
    info: (fields: Readonly<Record<string, unknown>>) => void;
}>;

export type Worker = Readonly<{
    isRunning: () => boolean;
    start: () => void;
    stop: (signal: ShutdownSignal) => void;
}>;

export function createWorker(logger: WorkerLogger = createStructuredLogger("worker")): Worker {
    let keepAliveTimer: ReturnType<typeof setInterval> | undefined;

    return {
        isRunning: (): boolean => keepAliveTimer !== undefined,

        start: (): void => {
            if (keepAliveTimer !== undefined) {
                return;
            }

            keepAliveTimer = setInterval(() => {
                // Queue polling will be implemented in a future issue.
            }, 60_000);

            logger.info({ event: "worker.started" });
        },

        stop: (signal: ShutdownSignal): void => {
            if (keepAliveTimer === undefined) {
                return;
            }

            clearInterval(keepAliveTimer);
            keepAliveTimer = undefined;

            logger.info({ event: "worker.shutdown", signal });
        },
    };
}

/** Queue adapters establish this context before executing a job. */
export function runWorkerJob<T>(correlationId: string | undefined, job: () => T): T {
    return runWithCorrelationContext({ correlationId: resolveCorrelationId(correlationId) }, job);
}
