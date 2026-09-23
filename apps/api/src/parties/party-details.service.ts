import type {
    AddPartyIdentifierRequest,
    CreatePartyAddressRequest,
    CreatePartyContactChannelRequest,
    CreatePartyContactRequest,
    PartyDetail,
    PartyVersionRequest,
    UpdatePartyAddressRequest,
    UpdatePartyContactRequest,
    UpdatePartyContactChannelRequest,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    partyAddresses,
    partyContactChannels,
    partyContacts,
    partyIdentifiers,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { recordAuditEvent } from "../audit/audit.service";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { OrganizationAuthorizationService } from "../auth/organization-authorization.service";
import { ContractException } from "../http/contracts";
import { PartyManagementService } from "./party-management.service";
import { advancePartyVersion } from "./party-transaction";

function normalizeIdentifier(value: string): string {
    const normalized = value
        .normalize("NFKC")
        .toUpperCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
    if (!normalized) throw new ContractException("INVALID_IDENTIFIER", 400);
    return normalized;
}

@Injectable()
export class PartyDetailsService {
    constructor(
        private readonly authorization: OrganizationAuthorizationService,
        private readonly parties: PartyManagementService,
    ) {}

    private async mutate(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        expectedVersion: number,
        kind: string,
        operation: (transaction: ArdenfoldTransaction) => Promise<void>,
    ): Promise<PartyDetail> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["parties.write"],
            async (transaction) => {
                await advancePartyVersion(transaction, organizationId, partyId, expectedVersion);
                await operation(transaction);
                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "party.details_changed",
                    resourceType: "party",
                    resourceId: partyId,
                    metadata: { kind },
                });
                return this.parties.getInTransaction(transaction, organizationId, partyId);
            },
        );
    }

    addIdentifier(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        input: AddPartyIdentifierRequest,
    ): Promise<PartyDetail> {
        const normalizedValue = normalizeIdentifier(input.originalValue);
        return this.mutate(
            principal,
            organizationId,
            partyId,
            input.expectedVersion,
            "identifier_added",
            async (transaction) => {
                await transaction.insert(partyIdentifiers).values({
                    organizationId,
                    partyId,
                    type: input.type.toLowerCase(),
                    originalValue: input.originalValue,
                    normalizedValue,
                });
            },
        );
    }

    removeIdentifier(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        identifierId: string,
        input: PartyVersionRequest,
    ): Promise<PartyDetail> {
        return this.mutate(
            principal,
            organizationId,
            partyId,
            input.expectedVersion,
            "identifier_removed",
            async (transaction) => {
                const removed = await transaction
                    .delete(partyIdentifiers)
                    .where(
                        and(
                            eq(partyIdentifiers.organizationId, organizationId),
                            eq(partyIdentifiers.partyId, partyId),
                            eq(partyIdentifiers.id, identifierId),
                        ),
                    )
                    .returning({ id: partyIdentifiers.id });
                if (!removed.length) throw new ContractException("PARTY_IDENTIFIER_NOT_FOUND", 404);
            },
        );
    }

    addContact(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        input: CreatePartyContactRequest,
    ): Promise<PartyDetail> {
        return this.mutate(
            principal,
            organizationId,
            partyId,
            input.expectedVersion,
            "contact_added",
            async (transaction) => {
                if (input.isPrimary)
                    await transaction
                        .update(partyContacts)
                        .set({ isPrimary: false })
                        .where(
                            and(
                                eq(partyContacts.organizationId, organizationId),
                                eq(partyContacts.partyId, partyId),
                                eq(partyContacts.isPrimary, true),
                            ),
                        );
                await transaction.insert(partyContacts).values({
                    organizationId,
                    partyId,
                    displayName: input.displayName,
                    jobTitle: input.jobTitle ?? null,
                    isPrimary: input.isPrimary,
                });
            },
        );
    }

    updateContact(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        contactId: string,
        input: UpdatePartyContactRequest,
    ): Promise<PartyDetail> {
        return this.mutate(
            principal,
            organizationId,
            partyId,
            input.expectedVersion,
            "contact_updated",
            async (transaction) => {
                if (input.isPrimary)
                    await transaction
                        .update(partyContacts)
                        .set({ isPrimary: false })
                        .where(
                            and(
                                eq(partyContacts.organizationId, organizationId),
                                eq(partyContacts.partyId, partyId),
                                eq(partyContacts.isPrimary, true),
                            ),
                        );
                const updated = await transaction
                    .update(partyContacts)
                    .set({
                        ...(input.displayName !== undefined
                            ? { displayName: input.displayName }
                            : {}),
                        ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
                        ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(partyContacts.organizationId, organizationId),
                            eq(partyContacts.partyId, partyId),
                            eq(partyContacts.id, contactId),
                        ),
                    )
                    .returning({ id: partyContacts.id });
                if (!updated.length) throw new ContractException("PARTY_CONTACT_NOT_FOUND", 404);
            },
        );
    }

    removeContact(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        contactId: string,
        input: PartyVersionRequest,
    ): Promise<PartyDetail> {
        return this.mutate(
            principal,
            organizationId,
            partyId,
            input.expectedVersion,
            "contact_removed",
            async (transaction) => {
                const [contact] = await transaction
                    .select({ id: partyContacts.id })
                    .from(partyContacts)
                    .where(
                        and(
                            eq(partyContacts.organizationId, organizationId),
                            eq(partyContacts.partyId, partyId),
                            eq(partyContacts.id, contactId),
                        ),
                    );
                if (!contact) throw new ContractException("PARTY_CONTACT_NOT_FOUND", 404);
                await transaction
                    .delete(partyContactChannels)
                    .where(
                        and(
                            eq(partyContactChannels.organizationId, organizationId),
                            eq(partyContactChannels.contactId, contactId),
                        ),
                    );
                await transaction
                    .delete(partyContacts)
                    .where(
                        and(
                            eq(partyContacts.organizationId, organizationId),
                            eq(partyContacts.id, contactId),
                        ),
                    );
            },
        );
    }

    addChannel(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        contactId: string,
        input: CreatePartyContactChannelRequest,
    ): Promise<PartyDetail> {
        return this.mutate(
            principal,
            organizationId,
            partyId,
            input.expectedVersion,
            "channel_added",
            async (transaction) => {
                const [contact] = await transaction
                    .select({ id: partyContacts.id })
                    .from(partyContacts)
                    .where(
                        and(
                            eq(partyContacts.organizationId, organizationId),
                            eq(partyContacts.partyId, partyId),
                            eq(partyContacts.id, contactId),
                        ),
                    );
                if (!contact) throw new ContractException("PARTY_CONTACT_NOT_FOUND", 404);
                await transaction.insert(partyContactChannels).values({
                    organizationId,
                    contactId,
                    type: input.type,
                    label: input.label ?? null,
                    value: input.value,
                });
            },
        );
    }

    updateChannel(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        contactId: string,
        channelId: string,
        input: UpdatePartyContactChannelRequest,
    ): Promise<PartyDetail> {
        return this.mutate(
            principal,
            organizationId,
            partyId,
            input.expectedVersion,
            "channel_updated",
            async (transaction) => {
                const [contact] = await transaction
                    .select({ id: partyContacts.id })
                    .from(partyContacts)
                    .where(
                        and(
                            eq(partyContacts.organizationId, organizationId),
                            eq(partyContacts.partyId, partyId),
                            eq(partyContacts.id, contactId),
                        ),
                    );
                if (!contact) throw new ContractException("PARTY_CONTACT_NOT_FOUND", 404);
                const updated = await transaction
                    .update(partyContactChannels)
                    .set({
                        ...(input.type !== undefined ? { type: input.type } : {}),
                        ...(input.label !== undefined ? { label: input.label } : {}),
                        ...(input.value !== undefined ? { value: input.value } : {}),
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(partyContactChannels.organizationId, organizationId),
                            eq(partyContactChannels.contactId, contactId),
                            eq(partyContactChannels.id, channelId),
                        ),
                    )
                    .returning({ id: partyContactChannels.id });
                if (!updated.length) throw new ContractException("PARTY_CHANNEL_NOT_FOUND", 404);
            },
        );
    }

    removeChannel(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        contactId: string,
        channelId: string,
        input: PartyVersionRequest,
    ): Promise<PartyDetail> {
        return this.mutate(
            principal,
            organizationId,
            partyId,
            input.expectedVersion,
            "channel_removed",
            async (transaction) => {
                const [contact] = await transaction
                    .select({ id: partyContacts.id })
                    .from(partyContacts)
                    .where(
                        and(
                            eq(partyContacts.organizationId, organizationId),
                            eq(partyContacts.partyId, partyId),
                            eq(partyContacts.id, contactId),
                        ),
                    );
                if (!contact) throw new ContractException("PARTY_CONTACT_NOT_FOUND", 404);
                const removed = await transaction
                    .delete(partyContactChannels)
                    .where(
                        and(
                            eq(partyContactChannels.organizationId, organizationId),
                            eq(partyContactChannels.contactId, contactId),
                            eq(partyContactChannels.id, channelId),
                        ),
                    )
                    .returning({ id: partyContactChannels.id });
                if (!removed.length) throw new ContractException("PARTY_CHANNEL_NOT_FOUND", 404);
            },
        );
    }

    addAddress(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        input: CreatePartyAddressRequest,
    ): Promise<PartyDetail> {
        return this.mutate(
            principal,
            organizationId,
            partyId,
            input.expectedVersion,
            "address_added",
            async (transaction) => {
                await transaction.insert(partyAddresses).values({
                    organizationId,
                    partyId,
                    label: input.label,
                    line1: input.line1,
                    line2: input.line2 ?? null,
                    locality: input.locality,
                    region: input.region ?? null,
                    postalCode: input.postalCode ?? null,
                    countryCode: input.countryCode.toUpperCase(),
                });
            },
        );
    }

    updateAddress(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        addressId: string,
        input: UpdatePartyAddressRequest,
    ): Promise<PartyDetail> {
        return this.mutate(
            principal,
            organizationId,
            partyId,
            input.expectedVersion,
            "address_updated",
            async (transaction) => {
                const updated = await transaction
                    .update(partyAddresses)
                    .set({
                        ...(input.label !== undefined ? { label: input.label } : {}),
                        ...(input.line1 !== undefined ? { line1: input.line1 } : {}),
                        ...(input.line2 !== undefined ? { line2: input.line2 } : {}),
                        ...(input.locality !== undefined ? { locality: input.locality } : {}),
                        ...(input.region !== undefined ? { region: input.region } : {}),
                        ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
                        ...(input.countryCode !== undefined
                            ? { countryCode: input.countryCode.toUpperCase() }
                            : {}),
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(partyAddresses.organizationId, organizationId),
                            eq(partyAddresses.partyId, partyId),
                            eq(partyAddresses.id, addressId),
                        ),
                    )
                    .returning({ id: partyAddresses.id });
                if (!updated.length) throw new ContractException("PARTY_ADDRESS_NOT_FOUND", 404);
            },
        );
    }

    removeAddress(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        addressId: string,
        input: PartyVersionRequest,
    ): Promise<PartyDetail> {
        return this.mutate(
            principal,
            organizationId,
            partyId,
            input.expectedVersion,
            "address_removed",
            async (transaction) => {
                const removed = await transaction
                    .delete(partyAddresses)
                    .where(
                        and(
                            eq(partyAddresses.organizationId, organizationId),
                            eq(partyAddresses.partyId, partyId),
                            eq(partyAddresses.id, addressId),
                        ),
                    )
                    .returning({ id: partyAddresses.id });
                if (!removed.length) throw new ContractException("PARTY_ADDRESS_NOT_FOUND", 404);
            },
        );
    }
}
