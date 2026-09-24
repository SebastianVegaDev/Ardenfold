import { Module } from "@nestjs/common";

import { AssetsModule } from "../assets/assets.module";
import { AuthModule } from "../auth/auth.module";
import { PartiesModule } from "../parties/parties.module";
import { RegistryImportsController } from "./http/registry-imports.controller";
import { RegistryImportService } from "./workflow/registry-import.service";

@Module({
    imports: [AuthModule, PartiesModule, AssetsModule],
    controllers: [RegistryImportsController],
    providers: [RegistryImportService],
})
export class RegistryImportsModule {}
