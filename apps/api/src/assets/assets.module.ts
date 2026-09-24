import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AssetsController } from "./http/assets.controller";
import { AssetManagementService } from "./management/asset-management.service";
import { AssetRelationshipsService } from "./relationships/asset-relationships.service";

@Module({
    imports: [AuthModule],
    controllers: [AssetsController],
    providers: [AssetManagementService, AssetRelationshipsService],
    exports: [AssetManagementService],
})
export class AssetsModule {}
