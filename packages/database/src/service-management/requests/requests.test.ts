import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "../../index";
import {
    assets,
    organizationMemberships,
    organizations,
    organizationSites,
    parties,
    partyContacts,
    partyRoles,
    serviceRequestHistoryEntries,
    serviceRequestScopeItems,
    serviceRequests,
    systemOrganizationRoleIds,
    users,
} from "../../schema";

describe("service management request persistence", () => {
    let migrator: DatabaseConnection;
    let runtime: DatabaseConnection;
    let container: StartedPostgreSqlContainer | undefined;

    beforeAll(async () => {
        let databaseUrl = process.env.DATABASE_TEST_URL;
        if (databaseUrl === undefined) {
            container = await new PostgreSqlContainer("postgres:18.6-bookworm")
                .withDatabase("ardenfold_requests_test")
                .withUsername("ardenfold_migrator")
                .withPassword("ardenfold_migrator_password")
                .start();
            databaseUrl = container.getConnectionUri();
        }

        const pool = new Pool({ connectionString: databaseUrl });
        try {
            await pool.query("DROP SCHEMA public CASCADE");
            await pool.query("CREATE SCHEMA public");
        } finally {
            await pool.end();
        }

        migrator = connection(databaseUrl);
        await migrate(migrator.database, { migrationsFolder: resolve(process.cwd(), "drizzle") });
        await migrator.database.execute(sql`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ardenfold_requests_runtime') THEN
                    CREATE ROLE ardenfold_requests_runtime LOGIN PASSWORD 'ardenfold_requests_password'
                        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
                END IF;
            END $$
        `);
        await migrator.database.execute(sql`
            GRANT ardenfold_runtime TO ardenfold_requests_runtime
        `);
        const runtimeUrl = new URL(databaseUrl);
        runtimeUrl.username = "ardenfold_requests_runtime";
        runtimeUrl.password = "ardenfold_requests_password";
        runtime = connection(runtimeUrl.toString());
    });

    beforeEach(async () => {
        await migrator.database.execute(sql`
            TRUNCATE TABLE ${organizationMemberships}, ${organizations}, ${users} CASCADE
        `);
    });

    afterAll(async () => {
        await runtime?.close();
        await migrator?.close();
        await container?.stop();
    });

    async function fixture() {
        const [first, second] = await migrator.database
            .insert(organizations)
            .values([{ name: "Service tenant one" }, { name: "Service tenant two" }])
            .returning();
        const [actor, otherActor] = await migrator.database
            .insert(users)
            .values([
                { primaryEmail: "requests-one@example.test" },
                { primaryEmail: "requests-two@example.test" },
            ])
            .returning();
        await migrator.database.insert(organizationMemberships).values([
            {
                organizationId: first!.id,
                userId: actor!.id,
                roleId: systemOrganizationRoleIds.owner,
                status: "active",
            },
            {
                organizationId: second!.id,
                userId: otherActor!.id,
                roleId: systemOrganizationRoleIds.owner,
                status: "active",
            },
        ]);
        const [customer, otherCustomer] = await migrator.database
            .insert(parties)
            .values([
                { organizationId: first!.id, kind: "organization", displayName: "Shared Customer" },
                {
                    organizationId: second!.id,
                    kind: "organization",
                    displayName: "Shared Customer",
                },
            ])
            .returning();
        await migrator.database.insert(partyRoles).values([
            { organizationId: first!.id, partyId: customer!.id, role: "customer" },
            { organizationId: second!.id, partyId: otherCustomer!.id, role: "customer" },
        ]);
        const [contact, otherContact] = await migrator.database
            .insert(partyContacts)
            .values([
                { organizationId: first!.id, partyId: customer!.id, displayName: "Requester" },
                {
                    organizationId: second!.id,
                    partyId: otherCustomer!.id,
                    displayName: "Requester",
                },
            ])
            .returning();
        const [site, otherSite] = await migrator.database
            .insert(organizationSites)
            .values([
                { organizationId: first!.id, name: "Site" },
                { organizationId: second!.id, name: "Site" },
            ])
            .returning();
        const [asset, otherAsset] = await migrator.database
            .insert(assets)
            .values([
                { organizationId: first!.id, displayName: "Pump" },
                { organizationId: second!.id, displayName: "Pump" },
            ])
            .returning();
        return {
            first: first!,
            second: second!,
            actor: actor!,
            otherActor: otherActor!,
            customer: customer!,
            otherCustomer: otherCustomer!,
            contact: contact!,
            otherContact: otherContact!,
            site: site!,
            otherSite: otherSite!,
            asset: asset!,
            otherAsset: otherAsset!,
        };
    }

    it("creates incomplete and identified scope under the correct customer and tenant", async () => {
        const f = await fixture();
        const request = await runtime.withTenantTransaction(
            { organizationId: f.first.id, userId: f.actor.id },
            async (tx) => {
                const [created] = await tx
                    .insert(serviceRequests)
                    .values({
                        organizationId: f.first.id,
                        customerPartyId: f.customer.id,
                        requesterContactId: f.contact.id,
                        siteId: f.site.id,
                        summary: "Inspect pump failure",
                        customerContext: "Intermittent pressure loss",
                        createdByUserId: f.actor.id,
                        updatedByUserId: f.actor.id,
                    })
                    .returning();
                await tx.insert(serviceRequestScopeItems).values([
                    {
                        organizationId: f.first.id,
                        requestId: created!.id,
                        position: 1,
                        description: "Inspect known pump",
                        assetId: f.asset.id,
                    },
                    {
                        organizationId: f.first.id,
                        requestId: created!.id,
                        position: 2,
                        description: "Inspect second pump",
                        unidentifiedAssetDescription: "Serial unknown",
                    },
                ]);
                await tx.insert(serviceRequestHistoryEntries).values({
                    organizationId: f.first.id,
                    requestId: created!.id,
                    version: 1,
                    kind: "created",
                    snapshot: { summary: created!.summary, scope: ["known", "unknown"] },
                    recordedByUserId: f.actor.id,
                });
                return created!;
            },
        );

        expect(request.status).toBe("active");
        expect(request.version).toBe(1);
        const rows = await runtime.withTenantTransaction(
            { organizationId: f.first.id, userId: f.actor.id },
            (tx) =>
                tx
                    .select()
                    .from(serviceRequestScopeItems)
                    .where(eq(serviceRequestScopeItems.requestId, request.id)),
        );
        expect(rows).toHaveLength(2);
        expect(rows[1]!.assetId).toBeNull();
        expect(rows[1]!.unidentifiedAssetDescription).toBe("Serial unknown");
        expect(
            await runtime.withTenantTransaction(
                { organizationId: f.second.id, userId: f.otherActor.id },
                (tx) => tx.select().from(serviceRequests),
            ),
        ).toEqual([]);
    });

    it("rejects cross-tenant and wrong-customer references, including direct runtime writes", async () => {
        const f = await fixture();
        const [localOtherParty] = await migrator.database
            .insert(parties)
            .values({
                organizationId: f.first.id,
                kind: "organization",
                displayName: "Another customer",
            })
            .returning();
        await migrator.database.insert(partyRoles).values({
            organizationId: f.first.id,
            partyId: localOtherParty!.id,
            role: "customer",
        });
        const [localOtherContact] = await migrator.database
            .insert(partyContacts)
            .values({
                organizationId: f.first.id,
                partyId: localOtherParty!.id,
                displayName: "Other contact",
            })
            .returning();
        const [provider] = await migrator.database
            .insert(parties)
            .values({
                organizationId: f.first.id,
                kind: "organization",
                displayName: "Provider only",
            })
            .returning();
        await migrator.database.insert(partyRoles).values({
            organizationId: f.first.id,
            partyId: provider!.id,
            role: "provider",
        });
        const base = {
            organizationId: f.first.id,
            customerPartyId: f.customer.id,
            summary: "Service need",
            createdByUserId: f.actor.id,
            updatedByUserId: f.actor.id,
        };
        for (const wrong of [
            { customerPartyId: f.otherCustomer.id },
            { customerPartyId: provider!.id },
            { requesterContactId: f.otherContact.id },
            { requesterContactId: localOtherContact!.id },
            { siteId: f.otherSite.id },
        ]) {
            await expect(
                runtime.withTenantTransaction(
                    { organizationId: f.first.id, userId: f.actor.id },
                    (tx) => tx.insert(serviceRequests).values({ ...base, ...wrong }),
                ),
            ).rejects.toThrow();
        }
        const [request] = await runtime.withTenantTransaction(
            { organizationId: f.first.id, userId: f.actor.id },
            (tx) => tx.insert(serviceRequests).values(base).returning(),
        );
        const [otherRequest] = await runtime.withTenantTransaction(
            { organizationId: f.second.id, userId: f.otherActor.id },
            (tx) =>
                tx
                    .insert(serviceRequests)
                    .values({
                        organizationId: f.second.id,
                        customerPartyId: f.otherCustomer.id,
                        summary: base.summary,
                        createdByUserId: f.otherActor.id,
                        updatedByUserId: f.otherActor.id,
                    })
                    .returning(),
        );
        await expect(
            runtime.withTenantTransaction(
                { organizationId: f.first.id, userId: f.actor.id },
                (tx) =>
                    tx.insert(serviceRequestScopeItems).values({
                        organizationId: f.first.id,
                        requestId: request!.id,
                        position: 1,
                        description: "Wrong asset",
                        assetId: f.otherAsset.id,
                    }),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(
                { organizationId: f.first.id, userId: f.actor.id },
                (tx) =>
                    tx.insert(serviceRequestScopeItems).values({
                        organizationId: f.first.id,
                        requestId: otherRequest!.id,
                        position: 1,
                        description: "Wrong request",
                    }),
            ),
        ).rejects.toThrow();
    });

    it("enforces lifecycle and version rules, and retains terminal requests and history", async () => {
        const f = await fixture();
        await expect(
            runtime.withTenantTransaction(
                { organizationId: f.first.id, userId: f.actor.id },
                (tx) =>
                    tx.insert(serviceRequests).values({
                        organizationId: f.first.id,
                        customerPartyId: f.customer.id,
                        summary: "Already closed",
                        status: "closed",
                        terminalAt: new Date(),
                        terminalReason: "Invalid creation",
                        createdByUserId: f.actor.id,
                        updatedByUserId: f.actor.id,
                    }),
            ),
        ).rejects.toThrow();
        const [request] = await runtime.withTenantTransaction(
            { organizationId: f.first.id, userId: f.actor.id },
            (tx) =>
                tx
                    .insert(serviceRequests)
                    .values({
                        organizationId: f.first.id,
                        customerPartyId: f.customer.id,
                        summary: "Initial need",
                        createdByUserId: f.actor.id,
                        updatedByUserId: f.actor.id,
                    })
                    .returning(),
        );
        const context = { organizationId: f.first.id, userId: f.actor.id };
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .update(serviceRequests)
                    .set({ summary: "Changed without version" })
                    .where(eq(serviceRequests.id, request!.id)),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .update(serviceRequests)
                    .set({ status: "cancelled", version: 2 })
                    .where(eq(serviceRequests.id, request!.id)),
            ),
        ).rejects.toThrow();
        const competing = await Promise.all(
            ["Clarified need", "Competing edit"].map((summary) =>
                runtime.withTenantTransaction(context, (tx) =>
                    tx
                        .update(serviceRequests)
                        .set({ summary, version: 2 })
                        .where(
                            and(
                                eq(serviceRequests.id, request!.id),
                                eq(serviceRequests.version, 1),
                            ),
                        )
                        .returning(),
                ),
            ),
        );
        expect(competing.map((result) => result.length).sort()).toEqual([0, 1]);
        const winningSummary = competing.flat()[0]!.summary;
        expect(competing.flat()[0]!.version).toBe(2);
        await runtime.withTenantTransaction(context, async (tx) => {
            await tx.insert(serviceRequestHistoryEntries).values([
                {
                    organizationId: f.first.id,
                    requestId: request!.id,
                    version: 1,
                    kind: "created",
                    snapshot: { summary: "Initial need" },
                    recordedByUserId: f.actor.id,
                },
                {
                    organizationId: f.first.id,
                    requestId: request!.id,
                    version: 2,
                    kind: "updated",
                    snapshot: { summary: winningSummary },
                    recordedByUserId: f.actor.id,
                },
            ]);
            await tx
                .update(serviceRequests)
                .set({
                    status: "closed",
                    version: 3,
                    terminalAt: new Date(),
                    terminalReason: "Handled without quote",
                })
                .where(eq(serviceRequests.id, request!.id));
            await tx.insert(serviceRequestHistoryEntries).values({
                organizationId: f.first.id,
                requestId: request!.id,
                version: 3,
                kind: "closed",
                snapshot: { summary: winningSummary, status: "closed" },
                reason: "Handled without quote",
                recordedByUserId: f.actor.id,
            });
        });
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .update(serviceRequests)
                    .set({ version: 4, status: "active", terminalAt: null, terminalReason: null })
                    .where(eq(serviceRequests.id, request!.id)),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx.delete(serviceRequests).where(eq(serviceRequests.id, request!.id)),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx.insert(serviceRequestScopeItems).values({
                    organizationId: f.first.id,
                    requestId: request!.id,
                    position: 1,
                    description: "Too late",
                }),
            ),
        ).rejects.toThrow();
        await expect(
            migrator.database.delete(serviceRequests).where(eq(serviceRequests.id, request!.id)),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .delete(serviceRequestHistoryEntries)
                    .where(eq(serviceRequestHistoryEntries.requestId, request!.id)),
            ),
        ).rejects.toThrow();
        const history = await runtime.withTenantTransaction(context, (tx) =>
            tx
                .select()
                .from(serviceRequestHistoryEntries)
                .where(eq(serviceRequestHistoryEntries.requestId, request!.id)),
        );
        expect(history).toHaveLength(3);
    });

    it("applies forced RLS to request, scope and history reads and writes", async () => {
        const f = await fixture();
        const firstContext = { organizationId: f.first.id, userId: f.actor.id };
        const secondContext = { organizationId: f.second.id, userId: f.otherActor.id };
        const [request] = await runtime.withTenantTransaction(firstContext, async (tx) => {
            const [created] = await tx
                .insert(serviceRequests)
                .values({
                    organizationId: f.first.id,
                    customerPartyId: f.customer.id,
                    summary: "RLS scope",
                    createdByUserId: f.actor.id,
                    updatedByUserId: f.actor.id,
                })
                .returning();
            await tx.insert(serviceRequestScopeItems).values({
                organizationId: f.first.id,
                requestId: created!.id,
                position: 1,
                description: "Scope item",
            });
            await tx.insert(serviceRequestHistoryEntries).values({
                organizationId: f.first.id,
                requestId: created!.id,
                version: 1,
                kind: "created",
                snapshot: { summary: "RLS scope" },
                recordedByUserId: f.actor.id,
            });
            return [created!];
        });
        expect(
            await runtime.withTenantTransaction(secondContext, async (tx) => ({
                requests: await tx.select().from(serviceRequests),
                scope: await tx.select().from(serviceRequestScopeItems),
                history: await tx.select().from(serviceRequestHistoryEntries),
            })),
        ).toEqual({ requests: [], scope: [], history: [] });
        expect(
            await runtime.withTenantTransaction(secondContext, (tx) =>
                tx
                    .update(serviceRequests)
                    .set({ version: 2, summary: "Wrong tenant" })
                    .where(eq(serviceRequests.id, request.id))
                    .returning(),
            ),
        ).toEqual([]);
        expect(
            await runtime.withTenantTransaction(secondContext, (tx) =>
                tx
                    .delete(serviceRequestScopeItems)
                    .where(eq(serviceRequestScopeItems.requestId, request.id))
                    .returning(),
            ),
        ).toEqual([]);
        await expect(
            runtime.withTenantTransaction(secondContext, (tx) =>
                tx.insert(serviceRequestHistoryEntries).values({
                    organizationId: f.first.id,
                    requestId: request.id,
                    version: 2,
                    kind: "updated",
                    snapshot: {},
                    recordedByUserId: f.otherActor.id,
                }),
            ),
        ).rejects.toThrow();
        expect(await runtime.database.select().from(serviceRequestScopeItems)).toEqual([]);
        expect(await runtime.database.select().from(serviceRequestHistoryEntries)).toEqual([]);
        await expect(
            runtime.database.insert(serviceRequestScopeItems).values({
                organizationId: f.first.id,
                requestId: request.id,
                position: 2,
                description: "No tenant context",
            }),
        ).rejects.toThrow();
        await expect(
            runtime.database.insert(serviceRequestHistoryEntries).values({
                organizationId: f.first.id,
                requestId: request.id,
                version: 2,
                kind: "updated",
                snapshot: {},
                recordedByUserId: f.actor.id,
            }),
        ).rejects.toThrow();
    });

    it("fails closed without tenant context and retains references through archive", async () => {
        const f = await fixture();
        expect(await runtime.database.select().from(serviceRequests)).toEqual([]);
        await expect(
            runtime.database.insert(serviceRequests).values({
                organizationId: f.first.id,
                customerPartyId: f.customer.id,
                summary: "No context",
                createdByUserId: f.actor.id,
                updatedByUserId: f.actor.id,
            }),
        ).rejects.toThrow();
        const [request] = await runtime.withTenantTransaction(
            { organizationId: f.first.id, userId: f.actor.id },
            async (tx) => {
                const [created] = await tx
                    .insert(serviceRequests)
                    .values({
                        organizationId: f.first.id,
                        customerPartyId: f.customer.id,
                        summary: "Historical request",
                        createdByUserId: f.actor.id,
                        updatedByUserId: f.actor.id,
                    })
                    .returning();
                await tx.insert(serviceRequestScopeItems).values({
                    organizationId: f.first.id,
                    requestId: created!.id,
                    position: 1,
                    description: "Inspect pump",
                    assetId: f.asset.id,
                });
                return [created!];
            },
        );
        await migrator.database
            .update(parties)
            .set({ status: "archived", archivedAt: new Date() })
            .where(eq(parties.id, f.customer.id));
        await migrator.database
            .update(assets)
            .set({ status: "archived", archivedAt: new Date() })
            .where(eq(assets.id, f.asset.id));
        expect(
            await runtime.withTenantTransaction(
                { organizationId: f.first.id, userId: f.actor.id },
                (tx) => tx.select().from(serviceRequests).where(eq(serviceRequests.id, request.id)),
            ),
        ).toHaveLength(1);
        await expect(
            migrator.database.delete(parties).where(eq(parties.id, f.customer.id)),
        ).rejects.toThrow();
        await expect(
            migrator.database.delete(assets).where(eq(assets.id, f.asset.id)),
        ).rejects.toThrow();
    });
});

function connection(connectionString: string): DatabaseConnection {
    return createDatabaseConnection({
        connectionString,
        max: 4,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 5_000,
        ssl: false,
        applicationName: "ardenfold-requests-tests",
    });
}
