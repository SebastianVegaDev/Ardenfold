import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module";
import type { EnvironmentVariables } from "./config/environment";

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

    app.enableShutdownHooks();

    const configService = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

    const port = configService.get("API_PORT", {
        infer: true,
    });

    await app.listen(port, "0.0.0.0");
}

bootstrap().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
