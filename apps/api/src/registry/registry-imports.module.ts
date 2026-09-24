import { Module } from "@nestjs/common";

import { AssetsModule } from "../assets/assets.module";
import { AuthModule } from "../auth/auth.module";
import { PartiesModule } from "../parties/parties.module";
import { RegistryImportService } from "./registry-import.service";
import { RegistryImportsController } from "./registry-imports.controller";

@Module({
    imports: [AuthModule, PartiesModule, AssetsModule],
    controllers: [RegistryImportsController],
    providers: [RegistryImportService],
})
export class RegistryImportsModule {}
