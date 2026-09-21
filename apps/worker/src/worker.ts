export type ShutdownSignal = "SIGINT" | "SIGTERM";

export type WorkerLogger = Readonly<{
    info: (message: string) => void;
}>;

export type Worker = Readonly<{
    isRunning: () => boolean;
    start: () => void;
    stop: (signal: ShutdownSignal) => void;
}>;

function serializeLog(event: "started" | "shutdown", signal?: ShutdownSignal): string {
    return JSON.stringify({
        level: "info",
        service: "worker",
        event,
        ...(signal === undefined ? {} : { signal }),
    });
}

export function createWorker(logger: WorkerLogger = console): Worker {
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

            logger.info(serializeLog("started"));
        },

        stop: (signal: ShutdownSignal): void => {
            if (keepAliveTimer === undefined) {
                return;
            }

            clearInterval(keepAliveTimer);
            keepAliveTimer = undefined;

            logger.info(serializeLog("shutdown", signal));
        },
    };
}
