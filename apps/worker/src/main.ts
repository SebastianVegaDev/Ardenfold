import { createWorker, type ShutdownSignal } from "./worker.js";

const worker = createWorker();

function shutdown(signal: ShutdownSignal): void {
    worker.stop(signal);
}

process.once("SIGINT", () => {
    shutdown("SIGINT");
});

process.once("SIGTERM", () => {
    shutdown("SIGTERM");
});

worker.start();
