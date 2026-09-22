import { contractSchemas } from "@ardenfold/contracts";

import type { INestApplication } from "@nestjs/common";

import {
    DocumentBuilder,
    SwaggerModule,
    type OpenAPIObject,
    type SchemaObject,
} from "@nestjs/swagger";

import { z } from "zod";

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
    const config = new DocumentBuilder().setTitle("Ardenfold API").setVersion("1.0.0").build();

    const document = SwaggerModule.createDocument(app, config);

    document.components ??= {};
    document.components.schemas ??= {};

    for (const [name, schema] of Object.entries(contractSchemas)) {
        document.components.schemas[name] = z.toJSONSchema(schema, {
            target: "openapi-3.0",
        }) as SchemaObject;
    }

    for (const path of Object.values(document.paths)) {
        for (const method of [
            "get",
            "post",
            "put",
            "patch",
            "delete",
            "options",
            "head",
        ] as const) {
            const operation = path[method];

            if (!operation) {
                continue;
            }

            operation.responses.default ??= {
                description: "Machine-readable error; clients localize the error code.",
                content: {
                    "application/json": {
                        schema: {
                            $ref: "#/components/schemas/ApiError",
                        },
                    },
                },
            };

            for (const response of Object.values(operation.responses)) {
                if (!response || "$ref" in response) {
                    continue;
                }

                response.headers ??= {};

                response.headers["x-request-id"] = {
                    schema: {
                        type: "string",
                        format: "uuid",
                    },
                    description: "Request correlation identifier.",
                };
            }
        }
    }

    return document;
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }

    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([key, item]) => [key, sortKeys(item)]),
        );
    }

    return value;
}

export function serializeOpenApi(document: OpenAPIObject): string {
    return JSON.stringify(sortKeys(document), null, 2) + "\n";
}
