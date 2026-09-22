import type { AuditAction } from "@ardenfold/contracts";

export const auditActionMessageKeys: Readonly<Record<AuditAction, string>> = {
    "organization.created": "audit.actions.organizationCreated",
    "organization.updated": "audit.actions.organizationUpdated",
    "site.created": "audit.actions.siteCreated",
    "invitation.created": "audit.actions.invitationCreated",
    "invitation.cancelled": "audit.actions.invitationCancelled",
    "invitation.accepted": "audit.actions.invitationAccepted",
    "membership.role_changed": "audit.actions.membershipRoleChanged",
    "membership.suspended": "audit.actions.membershipSuspended",
    "membership.removed": "audit.actions.membershipRemoved",
};
