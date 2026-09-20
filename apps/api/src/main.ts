import { NestFactory } from "@nestjs/core";
import {
    FastifyAdapter,
    type NestFastifyApplication,
} from "@nestjs/platform-fastify";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter(),
    );

    app.enableShutdownHooks();

    const port = Number.parseInt(process.env.PORT ?? "3001", 10);

    await app.listen(port, "0.0.0.0");
}

bootstrap().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});