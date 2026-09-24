import {
    partyDetailSchema,
    partyListResponseSchema,
    partySummarySchema,
    type CreatePartyRequest,
    type PartyDetail,
    type PartyListQuery,
    type PartyListResponse,
    type PartySummary,
    type PartyVersionRequest,
    type SetPartyRolesRequest,
    type UpdatePartyRequest,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import {
    parties,
    partyAddresses,
    partyContactChannels,
    partyContacts,
    partyIdentifiers,
    partyRoles,
    type Party,
} from "@ardenfold/database/schema";
import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { recordAuditEvent } from "../audit/audit.service";
import type { AuthenticatedPrincipal } from "../auth/auth.types";
import { OrganizationAuthorizationService } from "../auth/organization-authorization.service";
import { ContractException } from "../http/contracts";
import {
    decodeRegistryCursor,
    encodeRegistryCursor,
    registryFilterKey,
    searchPattern,
} from "../registry/search";
import { advancePartyVersion, getParty } from "./party-transaction";

function summary(party: Party, roles: ("customer" | "provider")[]): PartySummary {
    return partySummarySchema.parse({
        id: party.id,
        kind: party.kind,
        displayName: party.displayName,
        legalName: party.legalName,
        roles,
        status: party.status,
        version: party.version,
        createdAt: party.createdAt.toISOString(),
        updatedAt: party.updatedAt.toISOString(),
        archivedAt: party.archivedAt?.toISOString() ?? null,
    });
}

@Injectable()
export class PartyManagementService {
    constructor(private readonly authorization: OrganizationAuthorizationService) {}

    async create(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        input: CreatePartyRequest,
    ): Promise<PartySummary> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["parties.write"],
            (transaction) => this.createInTransaction(transaction, principal, organizationId, input),
        );
    }

    async createInTransaction(
        transaction: ArdenfoldTransaction,
        principal: AuthenticatedPrincipal,
        organizationId: string,
        input: CreatePartyRequest,
    ): Promise<PartySummary> {
        const [party] = await transaction
            .insert(parties)
            .values({
                organizationId,
                kind: input.kind,
                displayName: input.displayName,
                legalName: input.legalName ?? null,
            })
            .returning();
        await transaction.insert(partyRoles).values(
            input.roles.map((role) => ({
                organizationId,
                partyId: party!.id,
                role,
            })),
        );
        await recordAuditEvent(transaction, {
            organizationId,
            actorUserId: principal.user.id,
            action: "party.created",
            resourceType: "party",
            resourceId: party!.id,
        });
        return summary(party!, [...input.roles].sort());
    }

    async get(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
    ): Promise<PartyDetail> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["parties.read"],
            (transaction) => this.getInTransaction(transaction, organizationId, partyId),
        );
    }

    async getInTransaction(
        transaction: ArdenfoldTransaction,
        organizationId: string,
        partyId: string,
    ): Promise<PartyDetail> {
        const party = await getParty(transaction, organizationId, partyId);
        const [roles, identifiers, contacts, addresses] = await Promise.all([
            transaction
                .select()
                .from(partyRoles)
                .where(
                    and(
                        eq(partyRoles.organizationId, organizationId),
                        eq(partyRoles.partyId, partyId),
                    ),
                ),
            transaction
                .select()
                .from(partyIdentifiers)
                .where(
                    and(
                        eq(partyIdentifiers.organizationId, organizationId),
                        eq(partyIdentifiers.partyId, partyId),
                    ),
                )
                .orderBy(partyIdentifiers.id),
            transaction
                .select()
                .from(partyContacts)
                .where(
                    and(
                        eq(partyContacts.organizationId, organizationId),
                        eq(partyContacts.partyId, partyId),
                    ),
                )
                .orderBy(partyContacts.id),
            transaction
                .select()
                .from(partyAddresses)
                .where(
                    and(
                        eq(partyAddresses.organizationId, organizationId),
                        eq(partyAddresses.partyId, partyId),
                    ),
                )
                .orderBy(partyAddresses.id),
        ]);
        const channels = contacts.length
            ? await transaction
                  .select()
                  .from(partyContactChannels)
                  .where(
                      and(
                          eq(partyContactChannels.organizationId, organizationId),
                          inArray(
                              partyContactChannels.contactId,
                              contacts.map((contact) => contact.id),
                          ),
                      ),
                  )
                  .orderBy(partyContactChannels.id)
            : [];
        const duplicates = identifiers.length
            ? await transaction.execute<{
                  id: string;
                  displayName: string;
                  matchedType: string;
              }>(sql`
                  SELECT DISTINCT candidate.id, candidate.display_name AS "displayName",
                                  matched.type AS "matchedType"
                  FROM party_identifiers own
                  JOIN party_identifiers matched
                    ON matched.organization_id = own.organization_id
                   AND matched.type = own.type
                   AND matched.normalized_value = own.normalized_value
                   AND matched.party_id <> own.party_id
                  JOIN parties candidate
                    ON candidate.organization_id = matched.organization_id
                   AND candidate.id = matched.party_id
                  WHERE own.organization_id = ${organizationId}::uuid
                    AND own.party_id = ${partyId}::uuid
                  ORDER BY candidate.id, matched.type
                  LIMIT 20
              `)
            : { rows: [] };
        return partyDetailSchema.parse({
            ...summary(party, roles.map((row) => row.role).sort()),
            identifiers: identifiers.map(({ id, type, originalValue, normalizedValue }) => ({
                id,
                type,
                originalValue,
                normalizedValue,
            })),
            duplicateCandidates: duplicates.rows,
            contacts: contacts.map((contact) => ({
                id: contact.id,
                displayName: contact.displayName,
                jobTitle: contact.jobTitle,
                isPrimary: contact.isPrimary,
                channels: channels
                    .filter((channel) => channel.contactId === contact.id)
                    .map(({ id, type, label, value }) => ({ id, type, label, value })),
            })),
            addresses: addresses.map(
                ({ id, label, line1, line2, locality, region, postalCode, countryCode }) => ({
                    id,
                    label,
                    line1,
                    line2,
                    locality,
                    region,
                    postalCode,
                    countryCode,
                }),
            ),
        });
    }

    async list(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        query: PartyListQuery,
    ): Promise<PartyListResponse> {
        const filters = registryFilterKey({
            name: query.name,
            q: query.q,
            status: query.status,
            role: query.role,
            kind: query.kind,
            sort: query.sort,
        });
        const cursor = query.cursor
            ? decodeRegistryCursor(query.cursor, filters, "INVALID_PARTY_CURSOR")
            : undefined;
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["parties.read"],
            async (transaction) => {
                const normalizedName = sql`lower(${parties.displayName})`;
                const conditions = [eq(parties.organizationId, organizationId)];
                if (query.status) conditions.push(eq(parties.status, query.status));
                if (query.kind) conditions.push(eq(parties.kind, query.kind));
                if (query.name) {
                    conditions.push(
                        sql`${normalizedName} LIKE ${searchPattern(query.name)} ESCAPE ${"\\"}`,
                    );
                }
                if (query.q) {
                    const pattern = searchPattern(query.q);
                    conditions.push(sql`(
                        ${normalizedName} LIKE ${pattern} ESCAPE ${"\\"}
                        OR lower(coalesce(${parties.legalName}, '')) LIKE ${pattern} ESCAPE ${"\\"}
                        OR EXISTS (
                            SELECT 1 FROM party_identifiers identifier
                            WHERE identifier.organization_id = ${organizationId}::uuid
                              AND identifier.party_id = ${parties.id}
                              AND (lower(identifier.original_value) LIKE ${pattern} ESCAPE ${"\\"}
                                   OR lower(identifier.normalized_value) LIKE ${pattern} ESCAPE ${"\\"})
                        )
                        OR EXISTS (
                            SELECT 1 FROM party_contacts contact
                            WHERE contact.organization_id = ${organizationId}::uuid
                              AND contact.party_id = ${parties.id}
                              AND lower(contact.display_name) LIKE ${pattern} ESCAPE ${"\\"}
                        )
                        OR EXISTS (
                            SELECT 1 FROM party_contacts contact
                            JOIN party_contact_channels channel
                              ON channel.organization_id = contact.organization_id
                             AND channel.contact_id = contact.id
                            WHERE contact.organization_id = ${organizationId}::uuid
                              AND contact.party_id = ${parties.id}
                              AND lower(channel.value) LIKE ${pattern} ESCAPE ${"\\"}
                        )
                    )`);
                }
                if (query.role)
                    conditions.push(
                        sql`EXISTS (SELECT 1 FROM party_roles role WHERE role.organization_id = ${parties.organizationId} AND role.party_id = ${parties.id} AND role.role = ${query.role})`,
                    );
                if (cursor) {
                    if (cursor.sort !== query.sort)
                        throw new ContractException("INVALID_PARTY_CURSOR", 400);
                    conditions.push(
                        query.sort === "updated_desc"
                            ? sql`(${parties.updatedAt}, ${parties.id}) < (${new Date(cursor.key)}, ${cursor.id}::uuid)`
                            : query.sort === "name_desc"
                              ? sql`(${normalizedName}, ${parties.id}) < (${cursor.key}, ${cursor.id}::uuid)`
                              : sql`(${normalizedName}, ${parties.id}) > (${cursor.key}, ${cursor.id}::uuid)`,
                    );
                }
                const rows = await transaction
                    .select()
                    .from(parties)
                    .where(and(...conditions))
                    .orderBy(
                        query.sort === "updated_desc"
                            ? desc(parties.updatedAt)
                            : query.sort === "name_desc"
                              ? desc(normalizedName)
                              : asc(normalizedName),
                        query.sort === "name_asc" ? asc(parties.id) : desc(parties.id),
                    )
                    .limit(query.limit + 1);
                const page = rows.slice(0, query.limit);
                const roles = page.length
                    ? await transaction
                          .select()
                          .from(partyRoles)
                          .where(
                              and(
                                  eq(partyRoles.organizationId, organizationId),
                                  inArray(
                                      partyRoles.partyId,
                                      page.map((party) => party.id),
                                  ),
                              ),
                          )
                    : [];
                const last = page.at(-1);
                return partyListResponseSchema.parse({
                    data: page.map((party) =>
                        summary(
                            party,
                            roles
                                .filter((role) => role.partyId === party.id)
                                .map((role) => role.role)
                                .sort(),
                        ),
                    ),
                    nextCursor:
                        rows.length > query.limit && last
                            ? encodeRegistryCursor({
                                  key:
                                      query.sort === "updated_desc"
                                          ? last.updatedAt.toISOString()
                                          : last.displayName.toLowerCase(),
                                  id: last.id,
                                  sort: query.sort,
                                  filters,
                              })
                            : null,
                });
            },
        );
    }

    async update(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        input: UpdatePartyRequest,
    ): Promise<PartySummary> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["parties.write"],
            async (transaction) => {
                await advancePartyVersion(
                    transaction,
                    organizationId,
                    partyId,
                    input.expectedVersion,
                );
                const [party] = await transaction
                    .update(parties)
                    .set({
                        ...(input.displayName !== undefined
                            ? { displayName: input.displayName }
                            : {}),
                        ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
                    })
                    .where(and(eq(parties.organizationId, organizationId), eq(parties.id, partyId)))
                    .returning();
                const roles = await transaction
                    .select()
                    .from(partyRoles)
                    .where(
                        and(
                            eq(partyRoles.organizationId, organizationId),
                            eq(partyRoles.partyId, partyId),
                        ),
                    );
                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "party.updated",
                    resourceType: "party",
                    resourceId: partyId,
                });
                return summary(party!, roles.map((row) => row.role).sort());
            },
        );
    }

    async setRoles(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        input: SetPartyRolesRequest,
    ): Promise<PartySummary> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["parties.write"],
            async (transaction) => {
                const party = await advancePartyVersion(
                    transaction,
                    organizationId,
                    partyId,
                    input.expectedVersion,
                );
                await transaction
                    .delete(partyRoles)
                    .where(
                        and(
                            eq(partyRoles.organizationId, organizationId),
                            eq(partyRoles.partyId, partyId),
                        ),
                    );
                await transaction
                    .insert(partyRoles)
                    .values(input.roles.map((role) => ({ organizationId, partyId, role })));
                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: "party.roles_changed",
                    resourceType: "party",
                    resourceId: partyId,
                });
                return summary(party, [...input.roles].sort());
            },
        );
    }

    async setArchived(
        principal: AuthenticatedPrincipal,
        organizationId: string,
        partyId: string,
        input: PartyVersionRequest,
        archived: boolean,
    ): Promise<PartySummary> {
        return this.authorization.withAuthorizedTransaction(
            principal.user.id,
            organizationId,
            ["parties.archive"],
            async (transaction) => {
                const existing = await getParty(transaction, organizationId, partyId);
                if (existing.version !== input.expectedVersion)
                    throw new ContractException("VERSION_CONFLICT", 409);
                if ((existing.status === "archived") === archived)
                    throw new ContractException("PARTY_LIFECYCLE_CONFLICT", 409);
                const [party] = await transaction
                    .update(parties)
                    .set({
                        status: archived ? "archived" : "active",
                        archivedAt: archived ? new Date() : null,
                        version: sql`${parties.version} + 1`,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(parties.organizationId, organizationId),
                            eq(parties.id, partyId),
                            eq(parties.version, input.expectedVersion),
                        ),
                    )
                    .returning();
                if (!party) throw new ContractException("VERSION_CONFLICT", 409);
                const roles = await transaction
                    .select()
                    .from(partyRoles)
                    .where(
                        and(
                            eq(partyRoles.organizationId, organizationId),
                            eq(partyRoles.partyId, partyId),
                        ),
                    );
                await recordAuditEvent(transaction, {
                    organizationId,
                    actorUserId: principal.user.id,
                    action: archived ? "party.archived" : "party.restored",
                    resourceType: "party",
                    resourceId: partyId,
                });
                return summary(party, roles.map((row) => row.role).sort());
            },
        );
    }
}
