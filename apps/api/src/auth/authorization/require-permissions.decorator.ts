import type { PermissionCode } from "@ardenfold/contracts";
import { SetMetadata } from "@nestjs/common";

export const REQUIRED_PERMISSIONS = Symbol("REQUIRED_PERMISSIONS");

export const RequirePermissions = (...permissions: readonly PermissionCode[]) =>
    SetMetadata(REQUIRED_PERMISSIONS, permissions);
