import type { ArdenfoldTransaction } from "@ardenfold/database";
import { parties, partyContacts, partyRoles } from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { ContractException } from "../../http/contracts";

@Injectable()
export class PartyReferenceService {
    async requireActiveCustomer(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        partyId: string,
        contactId: string | null,
    ): Promise<void> {
        const [party] = await transaction
            .select({ status: parties.status })
            .from(parties)
            .where(and(eq(parties.organizationId, organizationId), eq(parties.id, partyId)))
            .for("share");
        if (!party) throw new ContractException("CUSTOMER_NOT_FOUND", 404);
        if (party.status !== "active") throw new ContractException("CUSTOMER_ARCHIVED", 409);

        const [role] = await transaction
            .select({ role: partyRoles.role })
            .from(partyRoles)
            .where(
                and(
                    eq(partyRoles.organizationId, organizationId),
                    eq(partyRoles.partyId, partyId),
                    eq(partyRoles.role, "customer"),
                ),
            )
            .for("share");
        if (!role) throw new ContractException("CUSTOMER_ROLE_REQUIRED", 409);

        if (contactId) {
            const [contact] = await transaction
                .select({ id: partyContacts.id })
                .from(partyContacts)
                .where(
                    and(
                        eq(partyContacts.organizationId, organizationId),
                        eq(partyContacts.partyId, partyId),
                        eq(partyContacts.id, contactId),
                    ),
                )
                .for("share");
            if (!contact) throw new ContractException("REQUESTER_CONTACT_NOT_FOUND", 404);
        }
    }
}
