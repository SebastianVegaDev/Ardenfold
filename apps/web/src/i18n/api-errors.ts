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
    INVITATION_EXPIRED: "errors.invitationExpired",
    INVITATION_INVALID: "errors.invitationInvalid",
    INVITATION_EMAIL_MISMATCH: "errors.invitationEmailMismatch",
    LAST_OWNER_REQUIRED: "errors.lastOwnerRequired",
    ROLE_ASSIGNMENT_DENIED: "errors.roleAssignmentDenied",
    UNAUTHENTICATED: "errors.unauthenticated",
    VALIDATION_FAILED: "errors.validationFailed",
};

export function getApiErrorMessageKey(code: ApiError["error"]["code"]): string {
    return errorMessageKeys[code] ?? "errors.requestRejected";
}
