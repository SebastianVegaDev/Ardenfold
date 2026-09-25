import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            // Next supplies this marker during compilation; unit tests execute the server adapter directly.
            "server-only": fileURLToPath(
                new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
            ),
        },
    },
    test: {
        name: "web",
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.test.{ts,tsx}"],
        clearMocks: true,
        restoreMocks: true,
    },
});
