import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AssetsController } from "./http/assets.controller";
import { AssetManagementService } from "./management/asset-management.service";
import { AssetRelationshipsService } from "./relationships/asset-relationships.service";
import { AssetReferenceService } from "./queries/asset-reference.service";

@Module({
    imports: [AuthModule],
    controllers: [AssetsController],
    providers: [AssetManagementService, AssetRelationshipsService, AssetReferenceService],
    exports: [AssetManagementService, AssetReferenceService],
})
export class AssetsModule {}
