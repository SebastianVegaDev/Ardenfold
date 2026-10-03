import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller";
import { AssetsModule } from "./assets/assets.module";
import { AuthModule } from "./auth/auth.module";
import { AuditModule } from "./audit/audit.module";
import { validateEnvironment } from "./config/environment";
import { FilesModule } from "./files/files.module";
import { DatabaseModule } from "./infrastructure/database/database.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PartiesModule } from "./parties/parties.module";
import { RegistryImportsModule } from "./registry-imports/registry-imports.module";
import { ServiceManagementModule } from "./service-management/service-management.module";

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
        AssetsModule,
        RegistryImportsModule,
        ServiceManagementModule,
        FilesModule,
    ],
    controllers: [AppController],
})
export class AppModule {}
