import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { AuditModule } from "./audit/audit.module";
import { validateEnvironment } from "./config/environment";
import { DatabaseModule } from "./infrastructure/database/database.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PartiesModule } from "./parties/parties.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            cache: true,
            expandVariables: true,
            envFilePath: [".env", "../../.env"],
            validate: validateEnvironment,
        }),
        ObservabilityModule,
        DatabaseModule,
        AuthModule,
        AuditModule,
        PartiesModule,
    ],
    controllers: [AppController],
})
export class AppModule {}
