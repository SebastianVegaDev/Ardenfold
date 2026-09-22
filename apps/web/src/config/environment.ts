import { z } from "zod";

const serverEnvironmentSchema = z.object({
    WORKOS_CLIENT_ID: z.string().trim().min(1),
    WORKOS_API_KEY: z.string().trim().min(1),
    WORKOS_COOKIE_PASSWORD: z.string().min(32),
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.url(),
    ARDENFOLD_API_URL: z.url(),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function validateServerEnvironment(
    environment: Record<string, string | undefined>,
): ServerEnvironment {
    const result = serverEnvironmentSchema.safeParse(environment);

    if (!result.success) {
        const details = result.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");

        throw new Error(`Invalid web environment configuration: ${details}`);
    }

    return result.data;
}

let cached: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
    cached ??= validateServerEnvironment(process.env);
    return cached;
}
