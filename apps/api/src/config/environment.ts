import { z } from "zod";

const booleanFromEnvironment = z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value): boolean => {
        return typeof value === "boolean" ? value : value === "true";
    });

const postgresConnectionUrl = z
    .string()
    .min(1)
    .refine(
        (value): boolean => {
            try {
                const url = new URL(value);

                return url.protocol === "postgres:" || url.protocol === "postgresql:";
            } catch {
                return false;
            }
        },
        {
            message: "Must be a valid PostgreSQL connection URL.",
        },
    );

const httpsUrl = z.url().refine((value) => new URL(value).protocol === "https:", {
    message: "Must be an HTTPS URL.",
});

export const environmentSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),

    DATABASE_URL: postgresConnectionUrl,

    DATABASE_SSL: booleanFromEnvironment.default(false),

    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),

    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(5_000),

    WORKOS_CLIENT_ID: z.string().trim().min(1),

    WORKOS_API_KEY: z.string().trim().min(1),

    WORKOS_ISSUER: httpsUrl,

    WORKOS_JWKS_URL: httpsUrl,

    AUTH_JWT_CLOCK_TOLERANCE_SECONDS: z.coerce.number().int().min(0).max(60).default(5),
});

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(configuration: Record<string, unknown>): EnvironmentVariables {
    const result = environmentSchema.safeParse(configuration);

    if (!result.success) {
        const errors = result.error.issues
            .map((issue) => {
                const path = issue.path.length === 0 ? "environment" : issue.path.join(".");

                return `${path}: ${issue.message}`;
            })
            .join("; ");

        throw new Error(`Invalid environment configuration: ${errors}`);
    }

    return result.data;
}
