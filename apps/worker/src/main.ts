type ShutdownSignal = "SIGINT" | "SIGTERM";

let isShuttingDown = false;

const keepAliveTimer = setInterval(() => {
  // The worker will poll the queue here in a future issue.
}, 60_000);

function writeLog(
    event: "started" | "shutdown",
    signal?: ShutdownSignal,
): void {
    console.info(
        JSON.stringify({
            level: "info",
            service: "worker",
            event,
            ...(signal === undefined ? {} : { signal }),
        }),
    );
}

function shutdown(signal: ShutdownSignal): void {
    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;
    clearInterval(keepAliveTimer);
    writeLog("shutdown", signal);
}

process.once("SIGINT", () => {
    shutdown("SIGINT");
});

process.once("SIGTERM", () => {
    shutdown("SIGTERM");
});

writeLog("started");