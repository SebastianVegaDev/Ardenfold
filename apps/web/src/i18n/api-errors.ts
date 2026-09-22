import type { ApiError } from "@ardenfold/contracts";

const errorMessageKeys: Readonly<Record<string, string>> = {
    BAD_REQUEST: "errors.badRequest",
    CONFLICT: "errors.conflict",
    FORBIDDEN: "errors.forbidden",
    INTERNAL_ERROR: "errors.internalError",
    NOT_FOUND: "errors.notFound",
    ORGANIZATION_ACCESS_DENIED: "errors.organizationAccessDenied",
    ORGANIZATION_CONTEXT_REQUIRED: "errors.organizationContextRequired",
    PERMISSION_DENIED: "errors.permissionDenied",
    UNAUTHENTICATED: "errors.unauthenticated",
    VALIDATION_FAILED: "errors.validationFailed",
};

export function getApiErrorMessageKey(code: ApiError["error"]["code"]): string {
    return errorMessageKeys[code] ?? "errors.requestRejected";
}
