import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AssetManagementService } from "./asset-management.service";
import { AssetRelationshipsService } from "./asset-relationships.service";
import { AssetsController } from "./assets.controller";

@Module({
    imports: [AuthModule],
    controllers: [AssetsController],
    providers: [AssetManagementService, AssetRelationshipsService],
})
export class AssetsModule {}
