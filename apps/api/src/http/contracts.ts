import { randomUUID } from "node:crypto";

import { apiErrorSchema, type ApiError, type ValidationIssue } from "@ardenfold/contracts";

import {
    Catch,
    HttpException,
    Logger,
    RequestMethod,
    type ArgumentsHost,
    type ArgumentMetadata,
    type ExceptionFilter,
    type PipeTransform,
} from "@nestjs/common";

import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import type { FastifyReply, FastifyRequest } from "fastify";

import { z } from "zod";

export class ContractException extends HttpException {
    constructor(
        readonly code: string,
        status: number,
        readonly issues: ValidationIssue[] = [],
        readonly metadata: ApiError["error"]["metadata"] = {},
    ) {
        super(code, status);
    }
}

function validationCode(code: string): ValidationIssue["code"] {
    switch (code) {
        case "invalid_type":
            return "INVALID_TYPE";

        case "invalid_format":
            return "INVALID_FORMAT";

        case "too_small":
        case "too_big":
            return "OUT_OF_RANGE";

        case "unrecognized_keys":
            return "UNKNOWN_FIELD";

        default:
            return "INVALID_VALUE";
    }
}

export class ContractValidationPipe<T extends z.ZodType> implements PipeTransform<
    unknown,
    z.output<T>
> {
    constructor(private readonly schema: T) {}

    transform(value: unknown, metadata: ArgumentMetadata): z.output<T> {
        const result = this.schema.safeParse(value);

        if (result.success) {
            return result.data;
        }

        const source =
            metadata.type === "param" ? "params" : metadata.type === "query" ? "query" : "body";

        const base = metadata.data === undefined ? [] : [metadata.data];

        const issues: ValidationIssue[] = result.error.issues.flatMap((issue) => {
            const paths =
                issue.code === "unrecognized_keys"
                    ? issue.keys.map((key) => [...base, ...issue.path, key])
                    : [[...base, ...issue.path]];

            return paths.map((path) => ({
                source,
                path:
                    path.length === 0
                        ? ""
                        : "/" +
                          path
                              .map((part) => String(part).replace(/~/g, "~0").replace(/\//g, "~1"))
                              .join("/"),
                code: validationCode(issue.code),
            }));
        });

        throw new ContractException("VALIDATION_FAILED", 400, issues);
    }
}

const codes: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "UNPROCESSABLE_ENTITY",
    429: "RATE_LIMITED",
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(ApiExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const context = host.switchToHttp();

        const request = context.getRequest<FastifyRequest>();
        const reply = context.getResponse<FastifyReply>();

        if (reply.sent) {
            return;
        }

        let status = exception instanceof HttpException ? exception.getStatus() : 500;

        if (
            !(exception instanceof HttpException) &&
            exception instanceof Error &&
            "code" in exception
        ) {
            if (
                exception.code === "FST_ERR_CTP_INVALID_JSON_BODY" ||
                exception.code === "FST_ERR_CTP_EMPTY_JSON_BODY"
            ) {
                status = 400;
            }

            if (exception.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
                status = 413;
            }

            if (exception.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
                status = 415;
            }
        }

        if (status < 400 || status > 599) {
            status = 500;
        }

        const isServerError = status >= 500;

        const known =
            exception instanceof ContractException && !isServerError ? exception : undefined;

        const body: ApiError = {
            error: {
                code: isServerError
                    ? "INTERNAL_ERROR"
                    : (known?.code ?? codes[status] ?? "REQUEST_REJECTED"),
                status,
                traceId: request.id,
                issues: known?.issues ?? [],
                metadata: known?.metadata ?? {},
            },
        };

        if (isServerError) {
            this.logger.error({
                event: "request.failed",
                traceId: request.id,
                status,
            });
        }

        void reply.status(status).send(apiErrorSchema.parse(body));
    }
}

export function createHttpAdapter(): FastifyAdapter {
    return new FastifyAdapter({
        requestIdHeader: false,
        genReqId: () => randomUUID(),
    });
}

export function configureHttp(app: NestFastifyApplication): void {
    app.setGlobalPrefix("api/v1", {
        exclude: [
            {
                path: "health",
                method: RequestMethod.GET,
            },
        ],
    });

    app.useGlobalFilters(new ApiExceptionFilter());

    const server = app.getHttpAdapter().getInstance();

    server.addHook("onRequest", (request, reply, done) => {
        void reply.header("x-request-id", request.id);
        done();
    });
}
