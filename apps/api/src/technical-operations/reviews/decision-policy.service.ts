import type { TechnicalDecisionPolicy } from "@ardenfold/contracts";
import { organizations } from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { recordAuditEvent } from "../../audit/audit.service";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";

@Injectable()
export class TechnicalDecisionPolicyService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    get(principal: AuthenticatedPrincipal, organizationId: string) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["organization.read"],
            async (tx) => {
                const [policy] = await tx
                    .select({
                        requirePerformerReviewerSeparation:
                            organizations.requirePerformerReviewerSeparation,
                        requireReviewerApproverSeparation:
                            organizations.requireReviewerApproverSeparation,
                    })
                    .from(organizations)
                    .where(eq(organizations.id, organizationId));
                return policy!;
            },
        );
    }

    update(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        input: TechnicalDecisionPolicy,
    ) {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["organization.update"],
            async (tx) => {
                const [policy] = await tx
                    .update(organizations)
                    .set({ ...input, updatedAt: new Date() })
                    .where(eq(organizations.id, organizationId))
                    .returning({
                        requirePerformerReviewerSeparation:
                            organizations.requirePerformerReviewerSeparation,
                        requireReviewerApproverSeparation:
                            organizations.requireReviewerApproverSeparation,
                    });
                await recordAuditEvent(tx, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "organization.updated",
                    resourceType: "organization",
                    resourceId: organizationId,
                    metadata: { fields: "technicalDecisionPolicy" },
                });
                return policy!;
            },
        );
    }
}
