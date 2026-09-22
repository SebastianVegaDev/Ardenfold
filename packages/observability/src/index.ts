import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

export const correlationHeader = "x-request-id";

const correlationIdentifierPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CorrelationContext = Readonly<{
    correlationId: string;
}>;

export type LogFields = Readonly<Record<string, unknown>>;

export type StructuredLogger = Logger;

const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Returns a client correlation id only when it has the UUID shape required by
 * the public API contract. Arbitrary values must never be reflected into logs.
 */
export function resolveCorrelationId(value: unknown): string {
    if (
        typeof value === "string" &&
        value.length <= 36 &&
        correlationIdentifierPattern.test(value)
    ) {
        return value.toLowerCase();
    }

    return randomUUID();
}

export function getCorrelationContext(): CorrelationContext | undefined {
    return correlationStorage.getStore();
}

export function getCorrelationId(): string | undefined {
    return getCorrelationContext()?.correlationId;
}

export function runWithCorrelationContext<T>(context: CorrelationContext, callback: () => T): T {
    return correlationStorage.run(context, callback);
}

const redactionPaths = [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers.set-cookie",
    "req.headers.x-api-key",
    "req.headers.x-auth-token",
    "req.body.password",
    "req.body.passwordConfirmation",
    "req.body.token",
    "req.body.accessToken",
    "req.body.refreshToken",
    "req.body.clientSecret",
    "req.body.secret",
    "headers.authorization",
    "headers.cookie",
    "headers.set-cookie",
    "headers.x-api-key",
    "headers.x-auth-token",
    "password",
    "passwordConfirmation",
    "token",
    "accessToken",
    "refreshToken",
    "clientSecret",
    "secret",
];

export function createStructuredLogger(
    service: string,
    destination?: DestinationStream,
): StructuredLogger {
    const options: LoggerOptions = {
        base: {
            service,
        },
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        mixin: (): LogFields => {
            const correlationId = getCorrelationId();

            return correlationId === undefined ? {} : { correlationId };
        },
        redact: {
            paths: redactionPaths,
            censor: "[REDACTED]",
        },
        timestamp: pino.stdTimeFunctions.isoTime,
    };

    return destination === undefined ? pino(options) : pino(options, destination);
}
