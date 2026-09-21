import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller";
import { validateEnvironment } from "./config/environment";
import { DatabaseModule } from "./infrastructure/database/database.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            cache: true,
            expandVariables: true,
            envFilePath: [".env", "../../.env"],
            validate: validateEnvironment,
        }),
        DatabaseModule,
    ],
    controllers: [AppController],
})
export class AppModule {}
