import "reflect-metadata";

import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module";
import type { EnvironmentVariables } from "./config/environment";
import { configureHttp, createHttpAdapter } from "./http/contracts";

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestFastifyApplication>(AppModule, createHttpAdapter());

    configureHttp(app);

    app.enableShutdownHooks();

    const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

    await app.listen(
        config.get("API_PORT", {
            infer: true,
        }),
        "0.0.0.0",
    );
}

bootstrap().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
