import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "../../index";
import {
    assets,
    organizationMemberships,
    organizationSites,
    organizations,
    parties,
    partyRoles,
    quoteAcceptances,
    quoteRevisionLines,
    quoteRevisions,
    quotes,
    receiptCorrections,
    receiptItems,
    receipts,
    serviceRequests,
    systemOrganizationRoleIds,
    users,
    workItemHistoryEntries,
    workItems,
    workOrderHistoryEntries,
    workOrders,
} from "../../schema";

describe("service management operational persistence", () => {
    let migrator: DatabaseConnection;
    let runtime: DatabaseConnection;
    let unpermissionedRuntime: DatabaseConnection;
    let container: StartedPostgreSqlContainer | undefined;

    beforeAll(async () => {
        let databaseUrl = process.env.DATABASE_TEST_URL;
        if (!databaseUrl) {
            container = await new PostgreSqlContainer("postgres:18.6-bookworm")
                .withDatabase("ardenfold_operational_test")
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
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ardenfold_operational_runtime') THEN
                    CREATE ROLE ardenfold_operational_runtime LOGIN PASSWORD 'ardenfold_operational_password'
                        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
                END IF;
            END $$
        `);
        await migrator.database.execute(
            sql`GRANT ardenfold_runtime TO ardenfold_operational_runtime`,
        );
        const runtimeUrl = new URL(databaseUrl);
        runtimeUrl.username = "ardenfold_operational_runtime";
        runtimeUrl.password = "ardenfold_operational_password";
        unpermissionedRuntime = connection(runtimeUrl.toString());
        runtime = {
            ...unpermissionedRuntime,
            withTenantTransaction: (context, operation) =>
                unpermissionedRuntime.withTenantTransaction(context, async (tx) => {
                    await tx.execute(sql`
                        SELECT
                            set_config('ardenfold.permission.quotations.read', 'true', true),
                            set_config('ardenfold.permission.quotations.write', 'true', true),
                            set_config('ardenfold.permission.parties.read', 'true', true),
                            set_config('ardenfold.permission.service_requests.read', 'true', true),
                            set_config('ardenfold.permission.work_orders.read', 'true', true),
                            set_config('ardenfold.permission.work_orders.write', 'true', true),
                            set_config('ardenfold.permission.receipts.read', 'true', true),
                            set_config('ardenfold.permission.receipts.write', 'true', true)
                    `);
                    return operation(tx);
                }),
        };
    });

    beforeEach(async () => {
        await migrator.database.execute(
            sql`TRUNCATE TABLE ${organizationMemberships}, ${organizations}, ${users} CASCADE`,
        );
    });

    afterAll(async () => {
        await unpermissionedRuntime?.close();
        await migrator?.close();
        await container?.stop();
    });

    async function fixture() {
        const [org, otherOrg] = await migrator.database
            .insert(organizations)
            .values([{ name: "Operational tenant" }, { name: "Other tenant" }])
            .returning();
        const [actor, otherActor] = await migrator.database
            .insert(users)
            .values([
                { primaryEmail: "operational@example.test" },
                { primaryEmail: "other-operational@example.test" },
            ])
            .returning();
        await migrator.database.insert(organizationMemberships).values([
            {
                organizationId: org!.id,
                userId: actor!.id,
                roleId: systemOrganizationRoleIds.owner,
                status: "active",
            },
            {
                organizationId: otherOrg!.id,
                userId: otherActor!.id,
                roleId: systemOrganizationRoleIds.owner,
                status: "active",
            },
        ]);
        const [site, otherSite] = await migrator.database
            .insert(organizationSites)
            .values([
                { organizationId: org!.id, name: "Main" },
                { organizationId: otherOrg!.id, name: "Other" },
            ])
            .returning();
        const [customer, otherCustomer] = await migrator.database
            .insert(parties)
            .values([
                { organizationId: org!.id, kind: "organization", displayName: "Customer" },
                {
                    organizationId: otherOrg!.id,
                    kind: "organization",
                    displayName: "Other customer",
                },
            ])
            .returning();
        await migrator.database.insert(partyRoles).values([
            { organizationId: org!.id, partyId: customer!.id, role: "customer" },
            { organizationId: otherOrg!.id, partyId: otherCustomer!.id, role: "customer" },
        ]);
        const [asset, otherAsset] = await migrator.database
            .insert(assets)
            .values([
                { organizationId: org!.id, displayName: "Pump" },
                { organizationId: otherOrg!.id, displayName: "Other pump" },
            ])
            .returning();
        const [request] = await migrator.database
            .insert(serviceRequests)
            .values({
                organizationId: org!.id,
                customerPartyId: customer!.id,
                summary: "Inspect pump",
                createdByUserId: actor!.id,
                updatedByUserId: actor!.id,
            })
            .returning();
        const [quote] = await migrator.database
            .insert(quotes)
            .values({
                organizationId: org!.id,
                requestId: request!.id,
                customerPartyId: customer!.id,
                reference: "Q-1",
                createdByUserId: actor!.id,
                updatedByUserId: actor!.id,
            })
            .returning();
        const [revision] = await migrator.database.transaction(async (tx) => {
            await tx
                .update(quotes)
                .set({ version: 2, nextRevisionNumber: 2 })
                .where(eq(quotes.id, quote!.id));
            return tx
                .insert(quoteRevisions)
                .values({
                    organizationId: org!.id,
                    quoteId: quote!.id,
                    revisionNumber: 1,
                    sourceRequestVersion: request!.version,
                    currencyCode: "PEN",
                    currencyScale: 2,
                    createdByUserId: actor!.id,
                })
                .returning();
        });
        const [line] = await migrator.database
            .insert(quoteRevisionLines)
            .values({
                organizationId: org!.id,
                revisionId: revision!.id,
                currencyScale: 2,
                position: 1,
                description: "Inspection",
                quantity: "2",
                unit: "unit",
                unitPrice: "10",
                roundedBaseAmount: "20",
                totalAmount: "20",
            })
            .returning();
        await migrator.database
            .update(quoteRevisions)
            .set({
                status: "offered",
                version: 2,
                issuedAt: new Date(),
                issueChannel: "email",
                issuedByUserId: actor!.id,
                customerSnapshot: { name: "Customer" },
                subtotal: "20",
                total: "20",
            })
            .where(eq(quoteRevisions.id, revision!.id));
        const [acceptance] = await migrator.database
            .insert(quoteAcceptances)
            .values({
                organizationId: org!.id,
                quoteId: quote!.id,
                revisionId: revision!.id,
                idempotencyKey: randomUUID(),
                payloadHash: "a".repeat(64),
                recordedByUserId: actor!.id,
                channel: "email",
            })
            .returning();
        await migrator.database
            .update(quoteRevisions)
            .set({ status: "accepted", version: 3 })
            .where(eq(quoteRevisions.id, revision!.id));
        await migrator.database
            .update(quotes)
            .set({ status: "accepted", version: 3 })
            .where(eq(quotes.id, quote!.id));
        return {
            org: org!,
            otherOrg: otherOrg!,
            actor: actor!,
            otherActor: otherActor!,
            site: site!,
            otherSite: otherSite!,
            customer: customer!,
            otherCustomer: otherCustomer!,
            asset: asset!,
            otherAsset: otherAsset!,
            request: request!,
            quote: quote!,
            revision: revision!,
            line: line!,
            acceptance: acceptance!,
        };
    }

    function orderValues(f: Awaited<ReturnType<typeof fixture>>) {
        return {
            organizationId: f.org.id,
            requestId: f.request.id,
            customerPartyId: f.customer.id,
            quoteId: f.quote.id,
            acceptanceId: f.acceptance.id,
            acceptedRevisionId: f.revision.id,
            siteId: f.site.id,
            reference: "WO-1",
            initialAllocationSnapshot: { lines: [f.line.id] },
            idempotencyKey: randomUUID(),
            payloadHash: "b".repeat(64),
            createdByUserId: f.actor.id,
            authorizedByUserId: f.actor.id,
            updatedByUserId: f.actor.id,
        };
    }

    function itemValues(
        f: Awaited<ReturnType<typeof fixture>>,
        orderId: string,
        itemNumber: number,
    ) {
        return {
            organizationId: f.org.id,
            workOrderId: orderId,
            acceptedRevisionId: f.revision.id,
            sourceRevisionLineId: f.line.id,
            itemNumber,
            scopeDescription: "Inspect pump",
            allocatedQuantity: "1",
            allocatedUnit: "unit",
            assetRequirement: "required" as const,
            assetId: f.asset.id,
            serviceMode: "physical_intake" as const,
            createdByUserId: f.actor.id,
            updatedByUserId: f.actor.id,
        };
    }

    it("preserves the accepted basis, split items and history without receipt", async () => {
        const f = await fixture();
        const context = { organizationId: f.org.id, userId: f.actor.id };
        const [order] = await runtime.withTenantTransaction(context, (tx) =>
            tx.insert(workOrders).values(orderValues(f)).returning(),
        );
        expect(order!.acceptedRevisionId).toBe(f.revision.id);
        const items = await runtime.withTenantTransaction(context, (tx) =>
            tx
                .insert(workItems)
                .values([
                    itemValues(f, order!.id, 1),
                    { ...itemValues(f, order!.id, 2), serviceMode: "no_intake" },
                ])
                .returning(),
        );
        expect(items.map((item) => item.assetId)).toEqual([f.asset.id, f.asset.id]);
        expect(
            await runtime.withTenantTransaction(context, (tx) => tx.select().from(receipts)),
        ).toEqual([]);
        expect(
            await runtime.withTenantTransaction(context, (tx) =>
                tx.select().from(workOrderHistoryEntries),
            ),
        ).toHaveLength(1);
        expect(
            await runtime.withTenantTransaction(context, (tx) =>
                tx.select().from(workItemHistoryEntries),
            ),
        ).toHaveLength(2);
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx.insert(workOrders).values({ ...orderValues(f), reference: "WO-2" }),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .update(workOrders)
                    .set({ preparationNotes: "stale" })
                    .where(eq(workOrders.id, order!.id)),
            ),
        ).rejects.toThrow();
        const [updated] = await runtime.withTenantTransaction(context, (tx) =>
            tx
                .update(workOrders)
                .set({ version: 2, preparationNotes: "Ready for intake" })
                .where(eq(workOrders.id, order!.id))
                .returning(),
        );
        expect(updated!.version).toBe(2);
        const [cancelledItem] = await runtime.withTenantTransaction(context, (tx) =>
            tx
                .update(workItems)
                .set({
                    status: "cancelled",
                    version: 2,
                    cancelledAt: new Date(),
                    cancelledByUserId: f.actor.id,
                    cancellationReason: "Excluded by customer",
                })
                .where(eq(workItems.id, items[0]!.id))
                .returning(),
        );
        expect(cancelledItem!.status).toBe("cancelled");
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .update(workItems)
                    .set({
                        status: "ready",
                        version: 3,
                        cancelledAt: null,
                        cancelledByUserId: null,
                        cancellationReason: null,
                    })
                    .where(eq(workItems.id, items[0]!.id)),
            ),
        ).rejects.toThrow();
        expect(
            await runtime.withTenantTransaction(context, (tx) =>
                tx.select().from(workOrderHistoryEntries),
            ),
        ).toHaveLength(2);
    });

    it("rejects wrong commercial basis, cross-tenant references and missing tenant context", async () => {
        const f = await fixture();
        const context = { organizationId: f.org.id, userId: f.actor.id };
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx.insert(workOrders).values({ ...orderValues(f), siteId: f.otherSite.id }),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .insert(workOrders)
                    .values({ ...orderValues(f), customerPartyId: f.otherCustomer.id }),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .insert(workOrders)
                    .values({ ...orderValues(f), acceptedRevisionId: randomUUID() }),
            ),
        ).rejects.toThrow();
        const [order] = await runtime.withTenantTransaction(context, (tx) =>
            tx.insert(workOrders).values(orderValues(f)).returning(),
        );
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .insert(workItems)
                    .values({ ...itemValues(f, order!.id, 1), assetId: f.otherAsset.id }),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx.insert(workItems).values({ ...itemValues(f, randomUUID(), 1) }),
            ),
        ).rejects.toThrow();
        expect(
            await unpermissionedRuntime.withTenantTransaction(context, (tx) =>
                tx.select().from(workOrders),
            ),
        ).toEqual([]);
        expect(await runtime.database.select().from(workOrders)).toEqual([]);
        expect(
            await runtime.withTenantTransaction(
                { organizationId: f.otherOrg.id, userId: f.otherActor.id },
                (tx) => tx.select().from(workOrders),
            ),
        ).toEqual([]);
        await expect(runtime.database.insert(workOrders).values(orderValues(f))).rejects.toThrow();
    });

    it("records physical intake with or without an asset and retains correction history", async () => {
        const f = await fixture();
        const context = { organizationId: f.org.id, userId: f.actor.id };
        const [order] = await runtime.withTenantTransaction(context, (tx) =>
            tx.insert(workOrders).values(orderValues(f)).returning(),
        );
        const [item, unresolved] = await runtime.withTenantTransaction(context, (tx) =>
            tx
                .insert(workItems)
                .values([
                    itemValues(f, order!.id, 1),
                    {
                        ...itemValues(f, order!.id, 2),
                        assetId: null,
                        unresolvedAssetDescription: "Unlabelled pump",
                    },
                ])
                .returning(),
        );
        const [known, unknown] = await runtime.withTenantTransaction(context, async (tx) => {
            const first = await tx
                .insert(receipts)
                .values({
                    organizationId: f.org.id,
                    workOrderId: order!.id,
                    assetId: f.asset.id,
                    intakeDescription: "Pump received",
                    observedCondition: "Used",
                    accessories: ["case"],
                    receivedAt: new Date(),
                    responsibleActorName: "Courier",
                    idempotencyKey: randomUUID(),
                    payloadHash: "c".repeat(64),
                    recordedByUserId: f.actor.id,
                    updatedByUserId: f.actor.id,
                })
                .returning();
            await tx.insert(receiptItems).values({
                organizationId: f.org.id,
                workOrderId: order!.id,
                receiptId: first[0]!.id,
                workItemId: item!.id,
            });
            const second = await tx
                .insert(receipts)
                .values({
                    organizationId: f.org.id,
                    workOrderId: order!.id,
                    intakeDescription: "Unknown pump",
                    observedCondition: "Unknown",
                    receivedAt: new Date(),
                    responsibleActorName: "Courier",
                    idempotencyKey: randomUUID(),
                    payloadHash: "d".repeat(64),
                    recordedByUserId: f.actor.id,
                    updatedByUserId: f.actor.id,
                })
                .returning();
            await tx.insert(receiptItems).values({
                organizationId: f.org.id,
                workOrderId: order!.id,
                receiptId: second[0]!.id,
                workItemId: unresolved!.id,
            });
            return [first[0]!, second[0]!];
        });
        expect(known.assetId).toBe(f.asset.id);
        expect(unknown.assetId).toBeNull();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx.insert(receipts).values({
                    ...known,
                    id: randomUUID(),
                    assetId: f.otherAsset.id,
                    idempotencyKey: randomUUID(),
                }),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx.insert(receipts).values({
                    ...known,
                    id: randomUUID(),
                    workOrderId: randomUUID(),
                    idempotencyKey: randomUUID(),
                }),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .update(receipts)
                    .set({ version: 2, observedCondition: "Damaged" })
                    .where(eq(receipts.id, known.id)),
            ),
        ).rejects.toThrow();
        const [corrected] = await runtime.withTenantTransaction(context, async (tx) => {
            const before = await tx.execute<{ snapshot: Record<string, unknown> }>(sql`
                SELECT to_jsonb(r) AS snapshot FROM receipts r WHERE r.id = ${known.id} FOR UPDATE
            `);
            const [next] = await tx
                .update(receipts)
                .set({ version: 2, observedCondition: "Damaged" })
                .where(eq(receipts.id, known.id))
                .returning();
            const after = await tx.execute<{ snapshot: Record<string, unknown> }>(sql`
                SELECT to_jsonb(r) AS snapshot FROM receipts r WHERE r.id = ${known.id}
            `);
            await tx.insert(receiptCorrections).values({
                organizationId: f.org.id,
                workOrderId: order!.id,
                receiptId: known.id,
                version: 2,
                kind: "corrected",
                beforeSnapshot: before.rows[0]!.snapshot,
                afterSnapshot: after.rows[0]!.snapshot,
                reason: "Intake review",
                idempotencyKey: randomUUID(),
                payloadHash: "e".repeat(64),
                correctedByUserId: f.actor.id,
            });
            return [next!];
        });
        expect(corrected.observedCondition).toBe("Damaged");
        expect(
            await runtime.withTenantTransaction(context, (tx) =>
                tx.select().from(receiptCorrections),
            ),
        ).toHaveLength(1);
    });

    it("forces RLS on every operational table", async () => {
        const rows = await migrator.database.execute<{
            relname: string;
            relrowsecurity: boolean;
            relforcerowsecurity: boolean;
        }>(sql`
            SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
            WHERE relname IN ('work_orders','work_items','work_order_history_entries',
                              'work_item_history_entries','receipts','receipt_items','receipt_corrections')
        `);
        expect(rows.rows).toHaveLength(7);
        expect(rows.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    });

    it("can use the planned-item queue index for bounded oldest-work lookup", async () => {
        const plan = await migrator.database.transaction(async (tx) => {
            await tx.execute(sql`SET LOCAL enable_seqscan = off`);
            return tx.execute<{ "QUERY PLAN": string }>(sql`
                EXPLAIN (COSTS OFF)
                SELECT id FROM work_items
                WHERE organization_id = ${randomUUID()}::uuid AND status = 'planned'
                ORDER BY created_at DESC, id DESC
                LIMIT 25
            `);
        });
        expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
            "work_items_org_planned_created_id_idx",
        );
    });
});

function connection(connectionString: string): DatabaseConnection {
    return createDatabaseConnection({
        connectionString,
        max: 4,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 5_000,
        ssl: false,
        applicationName: "ardenfold-operational-tests",
    });
}
