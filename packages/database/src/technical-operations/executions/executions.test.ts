import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "../../index";
import {
    assets,
    executionConditions,
    executionHistoryEntries,
    executionRevisions,
    executionSupportingAssets,
    organizationMemberships,
    organizationSites,
    organizations,
    parties,
    partyRoles,
    quoteAcceptances,
    quoteRevisionLines,
    quoteRevisions,
    quotes,
    serviceRequests,
    systemOrganizationRoleIds,
    technicalExecutions,
    users,
    workItems,
    workOrders,
} from "../../schema";

function connection(connectionString: string): DatabaseConnection {
    return createDatabaseConnection({
        connectionString,
        max: 5,
        idleTimeoutMillis: 1_000,
        connectionTimeoutMillis: 5_000,
        ssl: false,
        applicationName: "technical-execution-persistence-test",
    });
}

describe("technical execution persistence", () => {
    let migrator: DatabaseConnection;
    let runtime: DatabaseConnection;
    let container: StartedPostgreSqlContainer | undefined;

    beforeAll(async () => {
        let databaseUrl = process.env.DATABASE_TEST_URL;
        if (!databaseUrl) {
            container = await new PostgreSqlContainer("postgres:18.6-bookworm")
                .withDatabase("ardenfold_technical_execution_test")
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
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ardenfold_technical_runtime') THEN
                    CREATE ROLE ardenfold_technical_runtime LOGIN PASSWORD 'ardenfold_technical_password'
                        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
                END IF;
            END $$
        `);
        await migrator.database.execute(
            sql`GRANT ardenfold_runtime TO ardenfold_technical_runtime`,
        );
        const runtimeUrl = new URL(databaseUrl);
        runtimeUrl.username = "ardenfold_technical_runtime";
        runtimeUrl.password = "ardenfold_technical_password";
        runtime = connection(runtimeUrl.toString());
    });

    beforeEach(async () => {
        await migrator.database.execute(
            sql`TRUNCATE TABLE ${organizationMemberships}, ${organizations}, ${users} CASCADE`,
        );
    });

    afterAll(async () => {
        await runtime?.close();
        await migrator?.close();
        await container?.stop();
    });

    async function fixture() {
        const [org, otherOrg] = await migrator.database
            .insert(organizations)
            .values([{ name: "Technical tenant" }, { name: "Other technical tenant" }])
            .returning();
        const [actor, otherActor] = await migrator.database
            .insert(users)
            .values([
                { primaryEmail: "technical@example.test" },
                { primaryEmail: "other-technical@example.test" },
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
                { organizationId: org!.id, name: "Main site" },
                { organizationId: otherOrg!.id, name: "Other site" },
            ])
            .returning();
        const [customer] = await migrator.database
            .insert(parties)
            .values({ organizationId: org!.id, kind: "organization", displayName: "Customer" })
            .returning();
        await migrator.database
            .insert(partyRoles)
            .values({ organizationId: org!.id, partyId: customer!.id, role: "customer" });
        const [asset, otherAsset] = await migrator.database
            .insert(assets)
            .values([
                { organizationId: org!.id, displayName: "Pump" },
                { organizationId: otherOrg!.id, displayName: "Foreign pump" },
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
                reference: "Q-TECH-1",
                createdByUserId: actor!.id,
                updatedByUserId: actor!.id,
            })
            .returning();
        const [commercialRevision] = await migrator.database.transaction(async (tx) => {
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
                revisionId: commercialRevision!.id,
                currencyScale: 2,
                position: 1,
                description: "Inspection",
                quantity: "1",
                unit: "unit",
                unitPrice: "10",
                roundedBaseAmount: "10",
                totalAmount: "10",
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
                subtotal: "10",
                total: "10",
            })
            .where(eq(quoteRevisions.id, commercialRevision!.id));
        const [acceptance] = await migrator.database
            .insert(quoteAcceptances)
            .values({
                organizationId: org!.id,
                quoteId: quote!.id,
                revisionId: commercialRevision!.id,
                idempotencyKey: randomUUID(),
                payloadHash: "a".repeat(64),
                recordedByUserId: actor!.id,
                channel: "email",
            })
            .returning();
        await migrator.database
            .update(quoteRevisions)
            .set({ status: "accepted", version: 3 })
            .where(eq(quoteRevisions.id, commercialRevision!.id));
        await migrator.database
            .update(quotes)
            .set({ status: "accepted", version: 3 })
            .where(eq(quotes.id, quote!.id));
        const [order] = await migrator.database
            .insert(workOrders)
            .values({
                organizationId: org!.id,
                requestId: request!.id,
                customerPartyId: customer!.id,
                quoteId: quote!.id,
                acceptanceId: acceptance!.id,
                acceptedRevisionId: commercialRevision!.id,
                siteId: site!.id,
                reference: "WO-TECH-1",
                initialAllocationSnapshot: { lines: [line!.id] },
                idempotencyKey: randomUUID(),
                payloadHash: "b".repeat(64),
                createdByUserId: actor!.id,
                authorizedByUserId: actor!.id,
                updatedByUserId: actor!.id,
            })
            .returning();
        const [item] = await migrator.database
            .insert(workItems)
            .values({
                organizationId: org!.id,
                workOrderId: order!.id,
                acceptedRevisionId: commercialRevision!.id,
                sourceRevisionLineId: line!.id,
                itemNumber: 1,
                scopeDescription: "Inspect pump",
                allocatedQuantity: "1",
                allocatedUnit: "unit",
                assetRequirement: "required",
                assetId: asset!.id,
                serviceMode: "no_intake",
                createdByUserId: actor!.id,
                updatedByUserId: actor!.id,
            })
            .returning();
        const [readyItem] = await migrator.database
            .update(workItems)
            .set({ status: "ready", version: 2 })
            .where(eq(workItems.id, item!.id))
            .returning();
        const [readyOrder] = await migrator.database
            .update(workOrders)
            .set({ status: "ready", version: 2 })
            .where(eq(workOrders.id, order!.id))
            .returning();
        return {
            org: org!,
            otherOrg: otherOrg!,
            actor: actor!,
            otherActor: otherActor!,
            site: site!,
            otherSite: otherSite!,
            asset: asset!,
            otherAsset: otherAsset!,
            commercialRevision: commercialRevision!,
            line: line!,
            order: readyOrder!,
            item: readyItem!,
        };
    }

    function executionValues(f: Awaited<ReturnType<typeof fixture>>) {
        return {
            organizationId: f.org.id,
            workOrderId: f.order.id,
            workItemId: f.item.id,
            attemptNumber: 1,
            workItemVersionAtStart: f.item.version,
            acceptedRevisionIdAtStart: f.commercialRevision.id,
            sourceRevisionLineIdAtStart: f.line.id,
            itemNumberAtStart: 1,
            scopeDescriptionAtStart: f.item.scopeDescription,
            allocatedQuantityAtStart: f.item.allocatedQuantity,
            allocatedUnitAtStart: f.item.allocatedUnit,
            siteIdAtStart: f.site.id,
            siteNameAtStart: f.site.name,
            targetAssetIdAtStart: f.asset.id,
            targetAssetLabelAtStart: f.asset.displayName,
            idempotencyKey: randomUUID(),
            payloadHash: "c".repeat(64),
            startedByUserId: f.actor.id,
        };
    }

    it("preserves immutable submitted revisions and rejects cross-tenant references", async () => {
        const f = await fixture();
        const [execution] = await migrator.database
            .insert(technicalExecutions)
            .values(executionValues(f))
            .returning();
        await expect(
            migrator.database.insert(technicalExecutions).values({
                ...executionValues(f),
                targetAssetIdAtStart: f.otherAsset.id,
            }),
        ).rejects.toThrow();
        await expect(
            migrator.database.insert(technicalExecutions).values({
                ...executionValues(f),
                siteIdAtStart: f.otherSite.id,
            }),
        ).rejects.toThrow();
        const [first] = await migrator.database.transaction(async (tx) => {
            await tx
                .update(technicalExecutions)
                .set({ version: 2, nextRevisionNumber: 2 })
                .where(eq(technicalExecutions.id, execution!.id));
            return tx
                .insert(executionRevisions)
                .values({
                    organizationId: f.org.id,
                    executionId: execution!.id,
                    revisionNumber: 1,
                    performerUserId: f.actor.id,
                    performerNameSnapshot: "Technician",
                    methodName: "Inspection method",
                    createdByUserId: f.actor.id,
                    updatedByUserId: f.actor.id,
                })
                .returning();
        });
        await migrator.database.insert(executionConditions).values({
            organizationId: f.org.id,
            executionId: execution!.id,
            revisionId: first!.id,
            position: 1,
            name: "Ambient temperature",
            decimalValue: "20.00",
            unitCode: "Cel",
        });
        await migrator.database.insert(executionSupportingAssets).values({
            organizationId: f.org.id,
            executionId: execution!.id,
            revisionId: first!.id,
            assetId: f.asset.id,
            position: 1,
            use: "Reference",
            assetLabelSnapshot: "Pump",
        });
        await expect(
            migrator.database.insert(executionSupportingAssets).values({
                organizationId: f.org.id,
                executionId: execution!.id,
                revisionId: first!.id,
                assetId: f.otherAsset.id,
                position: 2,
                use: "Reference",
                assetLabelSnapshot: "Other",
            }),
        ).rejects.toThrow();
        await migrator.database
            .update(executionRevisions)
            .set({
                status: "submitted",
                version: 2,
                submittedAt: new Date(),
                submittedByUserId: f.actor.id,
                requirePerformerReviewerSeparation: true,
                requireReviewerApproverSeparation: false,
            })
            .where(eq(executionRevisions.id, first!.id));
        await expect(
            migrator.database
                .update(executionRevisions)
                .set({
                    methodName: "Rewritten",
                    version: 3,
                })
                .where(eq(executionRevisions.id, first!.id)),
        ).rejects.toThrow();
        await expect(
            migrator.database
                .update(executionConditions)
                .set({
                    decimalValue: "21.00",
                })
                .where(eq(executionConditions.revisionId, first!.id)),
        ).rejects.toThrow();
        const [second] = await migrator.database.transaction(async (tx) => {
            await tx
                .update(technicalExecutions)
                .set({ version: 3, nextRevisionNumber: 3 })
                .where(eq(technicalExecutions.id, execution!.id));
            return tx
                .insert(executionRevisions)
                .values({
                    organizationId: f.org.id,
                    executionId: execution!.id,
                    revisionNumber: 2,
                    predecessorRevisionId: first!.id,
                    correctionReason: "Repeat observation",
                    createdByUserId: f.actor.id,
                    updatedByUserId: f.actor.id,
                })
                .returning();
        });
        expect(second!.revisionNumber).toBe(2);
        expect(await migrator.database.select().from(executionRevisions)).toHaveLength(2);
        await expect(
            migrator.database
                .update(executionConditions)
                .set({
                    revisionId: second!.id,
                })
                .where(eq(executionConditions.revisionId, first!.id)),
        ).rejects.toThrow();
    });

    it("allows only one active attempt and advances drafts with explicit versions", async () => {
        const f = await fixture();
        const [execution] = await migrator.database
            .insert(technicalExecutions)
            .values(executionValues(f))
            .returning();
        await expect(
            migrator.database.insert(technicalExecutions).values({
                ...executionValues(f),
                attemptNumber: 2,
            }),
        ).rejects.toThrow();
        await expect(
            migrator.database.insert(technicalExecutions).values({
                ...executionValues(f),
                attemptNumber: 3,
            }),
        ).rejects.toThrow();
        await expect(
            migrator.database.insert(technicalExecutions).values({
                ...executionValues(f),
                organizationId: f.otherOrg.id,
                workOrderId: f.order.id,
                workItemId: f.item.id,
                siteIdAtStart: f.otherSite.id,
                targetAssetIdAtStart: f.otherAsset.id,
                targetAssetLabelAtStart: f.otherAsset.displayName,
                startedByUserId: f.otherActor.id,
            }),
        ).rejects.toThrow();
        const [draft] = await migrator.database.transaction(async (tx) => {
            await tx
                .update(technicalExecutions)
                .set({ version: 2, nextRevisionNumber: 2 })
                .where(eq(technicalExecutions.id, execution!.id));
            return tx
                .insert(executionRevisions)
                .values({
                    organizationId: f.org.id,
                    executionId: execution!.id,
                    revisionNumber: 1,
                    createdByUserId: f.actor.id,
                    updatedByUserId: f.actor.id,
                })
                .returning();
        });
        const [advanced] = await migrator.database
            .update(executionRevisions)
            .set({ methodName: "Visual inspection", version: 2 })
            .where(and(eq(executionRevisions.id, draft!.id), eq(executionRevisions.version, 1)))
            .returning();
        expect(advanced!.version).toBe(2);
        expect(
            await migrator.database
                .update(executionRevisions)
                .set({ methodName: "Stale edit", version: 2 })
                .where(and(eq(executionRevisions.id, draft!.id), eq(executionRevisions.version, 1)))
                .returning(),
        ).toEqual([]);
        await migrator.database
            .update(executionRevisions)
            .set({
                status: "discarded",
                version: 3,
                discardedAt: new Date(),
                discardedByUserId: f.actor.id,
                discardReason: "Wrong method",
            })
            .where(eq(executionRevisions.id, draft!.id));
        await expect(
            migrator.database
                .update(executionRevisions)
                .set({ methodName: "Rewrite", version: 4 })
                .where(eq(executionRevisions.id, draft!.id)),
        ).rejects.toThrow();
        await migrator.database
            .update(technicalExecutions)
            .set({
                status: "abandoned",
                version: 3,
                abandonedAt: new Date(),
                abandonedByUserId: f.actor.id,
                abandonmentReason: "Restart required",
            })
            .where(eq(technicalExecutions.id, execution!.id));
        const [replacement] = await migrator.database
            .insert(technicalExecutions)
            .values({ ...executionValues(f), attemptNumber: 2 })
            .returning();
        expect(replacement!.attemptNumber).toBe(2);
        expect(await migrator.database.select().from(technicalExecutions)).toHaveLength(2);
    });

    it("forces tenant and permission isolation even for a known object ID", async () => {
        const f = await fixture();
        const [execution] = await migrator.database
            .insert(technicalExecutions)
            .values(executionValues(f))
            .returning();
        const [revision] = await migrator.database.transaction(async (tx) => {
            await tx
                .update(technicalExecutions)
                .set({ version: 2, nextRevisionNumber: 2 })
                .where(eq(technicalExecutions.id, execution!.id));
            return tx
                .insert(executionRevisions)
                .values({
                    organizationId: f.org.id,
                    executionId: execution!.id,
                    revisionNumber: 1,
                    createdByUserId: f.actor.id,
                    updatedByUserId: f.actor.id,
                })
                .returning();
        });
        await migrator.database.insert(executionConditions).values({
            organizationId: f.org.id,
            executionId: execution!.id,
            revisionId: revision!.id,
            position: 1,
            name: "Humidity",
            decimalValue: "45.0",
            unitCode: "%",
        });
        await expect(
            migrator.database.insert(executionRevisions).values({
                organizationId: f.otherOrg.id,
                executionId: execution!.id,
                revisionNumber: 1,
                createdByUserId: f.otherActor.id,
                updatedByUserId: f.otherActor.id,
            }),
        ).rejects.toThrow();
        await expect(
            migrator.database.insert(executionConditions).values({
                organizationId: f.otherOrg.id,
                executionId: execution!.id,
                revisionId: revision!.id,
                position: 2,
                name: "Foreign",
                textValue: "No",
            }),
        ).rejects.toThrow();
        expect(await runtime.database.select().from(technicalExecutions)).toEqual([]);
        const forced = await migrator.database.execute(sql`
            SELECT relname, relforcerowsecurity
            FROM pg_class
            WHERE relname IN ('technical_executions', 'execution_revisions',
                              'execution_conditions', 'execution_supporting_assets',
                              'execution_history_entries')
        `);
        expect(forced.rows).toHaveLength(5);
        expect(forced.rows.every((row) => row.relforcerowsecurity === true)).toBe(true);
        const local = { organizationId: f.org.id, userId: f.actor.id };
        const foreign = { organizationId: f.otherOrg.id, userId: f.otherActor.id };
        const granted = (context: typeof local) =>
            runtime.withTenantTransaction(context, async (tx) => {
                await tx.execute(
                    sql`SELECT set_config('ardenfold.permission.technical_executions.read', 'true', true)`,
                );
                return tx.select().from(technicalExecutions);
            });
        expect(await granted(local)).toHaveLength(1);
        expect(await granted(foreign)).toEqual([]);
        expect(
            await runtime.withTenantTransaction(foreign, async (tx) => {
                await tx.execute(
                    sql`SELECT set_config('ardenfold.permission.technical_executions.read', 'true', true)`,
                );
                return tx.select().from(executionRevisions);
            }),
        ).toEqual([]);
        await expect(
            runtime.withTenantTransaction(local, async (tx) => {
                await tx.execute(
                    sql`SELECT set_config('ardenfold.permission.technical_executions.read', 'true', true)`,
                );
                return tx.insert(technicalExecutions).values({
                    ...executionValues(f),
                    attemptNumber: 2,
                });
            }),
        ).rejects.toThrow();
        expect(
            await runtime.withTenantTransaction(local, (tx) =>
                tx.select().from(technicalExecutions),
            ),
        ).toEqual([]);
        await migrator.database.insert(executionHistoryEntries).values({
            organizationId: f.org.id,
            executionId: execution!.id,
            executionVersion: 1,
            kind: "started",
            snapshot: { attempt: 1 },
            recordedByUserId: f.actor.id,
        });
        await expect(
            migrator.database.update(executionHistoryEntries).set({ kind: "changed" }),
        ).rejects.toThrow();
        await migrator.database
            .update(organizationMemberships)
            .set({
                status: "suspended",
                suspendedAt: new Date(),
            })
            .where(eq(organizationMemberships.userId, f.actor.id));
        expect(await granted(local)).toEqual([]);
    });
});
