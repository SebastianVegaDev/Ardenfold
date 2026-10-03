import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { FilesController } from "./http/files.controller";
import { PrivateObjectStore } from "./storage/private-object-store";
import { FileUploadsService } from "./uploads/file-uploads.service";

@Module({
    imports: [AuthModule],
    controllers: [FilesController],
    providers: [PrivateObjectStore, FileUploadsService],
    exports: [PrivateObjectStore, FileUploadsService],
})
export class FilesModule {}
