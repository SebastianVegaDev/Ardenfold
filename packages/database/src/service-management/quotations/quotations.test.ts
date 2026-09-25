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
    parties,
    partyRoles,
    quoteLineAdjustments,
    quoteRevisionAdjustments,
    quoteRevisionLines,
    quoteRevisions,
    quotes,
    serviceRequests,
    systemOrganizationRoleIds,
    users,
} from "../../schema";

describe("service management quotation persistence", () => {
    let migrator: DatabaseConnection;
    let runtime: DatabaseConnection;
    let unpermissionedRuntime: DatabaseConnection;
    let container: StartedPostgreSqlContainer | undefined;

    beforeAll(async () => {
        let databaseUrl = process.env.DATABASE_TEST_URL;
        if (databaseUrl === undefined) {
            container = await new PostgreSqlContainer("postgres:18.6-bookworm")
                .withDatabase("ardenfold_quotations_test")
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
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ardenfold_quotations_runtime') THEN
                    CREATE ROLE ardenfold_quotations_runtime LOGIN PASSWORD 'ardenfold_quotations_password'
                        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
                END IF;
            END $$
        `);
        await migrator.database.execute(
            sql`GRANT ardenfold_runtime TO ardenfold_quotations_runtime`,
        );
        const runtimeUrl = new URL(databaseUrl);
        runtimeUrl.username = "ardenfold_quotations_runtime";
        runtimeUrl.password = "ardenfold_quotations_password";
        unpermissionedRuntime = connection(runtimeUrl.toString());
        runtime = {
            ...unpermissionedRuntime,
            withTenantTransaction: (context, operation) =>
                unpermissionedRuntime.withTenantTransaction(context, async (tx) => {
                    await tx.execute(sql`
                        SELECT
                            set_config('ardenfold.permission.quotations.read', 'true', true),
                            set_config('ardenfold.permission.quotations.write', 'true', true)
                    `);
                    return operation(tx);
                }),
        };
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
            .values([{ name: "Quotation tenant one" }, { name: "Quotation tenant two" }])
            .returning();
        const [actor, otherActor] = await migrator.database
            .insert(users)
            .values([
                { primaryEmail: "quotation-one@example.test" },
                { primaryEmail: "quotation-two@example.test" },
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
                { organizationId: first!.id, kind: "organization", displayName: "Original Name" },
                {
                    organizationId: second!.id,
                    kind: "organization",
                    displayName: "Other Customer",
                },
            ])
            .returning();
        await migrator.database.insert(partyRoles).values([
            { organizationId: first!.id, partyId: customer!.id, role: "customer" },
            { organizationId: second!.id, partyId: otherCustomer!.id, role: "customer" },
        ]);
        const [asset, otherAsset] = await migrator.database
            .insert(assets)
            .values([
                { organizationId: first!.id, displayName: "Original Pump" },
                { organizationId: second!.id, displayName: "Other Pump" },
            ])
            .returning();
        const [request, otherRequest] = await migrator.database
            .insert(serviceRequests)
            .values([
                {
                    organizationId: first!.id,
                    customerPartyId: customer!.id,
                    summary: "Inspect pump",
                    createdByUserId: actor!.id,
                    updatedByUserId: actor!.id,
                },
                {
                    organizationId: second!.id,
                    customerPartyId: otherCustomer!.id,
                    summary: "Inspect other pump",
                    createdByUserId: otherActor!.id,
                    updatedByUserId: otherActor!.id,
                },
            ])
            .returning();
        return {
            first: first!,
            second: second!,
            actor: actor!,
            otherActor: otherActor!,
            customer: customer!,
            otherCustomer: otherCustomer!,
            asset: asset!,
            otherAsset: otherAsset!,
            request: request!,
            otherRequest: otherRequest!,
        };
    }

    async function createQuote(f: Awaited<ReturnType<typeof fixture>>, reference = "Q-1") {
        const [quote] = await runtime.withTenantTransaction(
            { organizationId: f.first.id, userId: f.actor.id },
            (tx) =>
                tx
                    .insert(quotes)
                    .values({
                        organizationId: f.first.id,
                        requestId: f.request.id,
                        customerPartyId: f.customer.id,
                        reference,
                        createdByUserId: f.actor.id,
                        updatedByUserId: f.actor.id,
                    })
                    .returning(),
        );
        return quote!;
    }

    async function createRevision(
        f: Awaited<ReturnType<typeof fixture>>,
        quote: typeof quotes.$inferSelect,
        sourceRevisionId?: string,
    ) {
        const [revision] = await runtime.withTenantTransaction(
            { organizationId: f.first.id, userId: f.actor.id },
            async (tx) => {
                const [reserved] = await tx
                    .update(quotes)
                    .set({
                        version: quote.version + 1,
                        nextRevisionNumber: quote.nextRevisionNumber + 1,
                    })
                    .where(and(eq(quotes.id, quote.id), eq(quotes.version, quote.version)))
                    .returning();
                expect(reserved).toBeDefined();
                return tx
                    .insert(quoteRevisions)
                    .values({
                        organizationId: f.first.id,
                        quoteId: quote.id,
                        revisionNumber: quote.nextRevisionNumber,
                        sourceRevisionId,
                        sourceRequestVersion: f.request.version,
                        currencyCode: "PEN",
                        currencyScale: 2,
                        createdByUserId: f.actor.id,
                    })
                    .returning();
            },
        );
        return revision!;
    }

    it("allocates durable revisions in order and rejects gaps, duplicates and stale versions", async () => {
        const f = await fixture();
        const quote = await createQuote(f);
        const [replacementCustomer] = await migrator.database
            .insert(parties)
            .values({
                organizationId: f.first.id,
                kind: "organization",
                displayName: "Replacement Customer",
            })
            .returning();
        await migrator.database.insert(partyRoles).values({
            organizationId: f.first.id,
            partyId: replacementCustomer!.id,
            role: "customer",
        });
        await expect(
            migrator.database
                .update(serviceRequests)
                .set({ customerPartyId: replacementCustomer!.id, version: 2 })
                .where(eq(serviceRequests.id, f.request.id)),
        ).rejects.toThrow();
        const first = await createRevision(f, quote);
        expect(first.revisionNumber).toBe(1);
        const [editedDraft] = await runtime.withTenantTransaction(
            { organizationId: f.first.id, userId: f.actor.id },
            (tx) =>
                tx
                    .update(quoteRevisions)
                    .set({ version: 2, paymentTerms: "Net 30" })
                    .where(and(eq(quoteRevisions.id, first.id), eq(quoteRevisions.version, 1)))
                    .returning(),
        );
        expect(editedDraft!.paymentTerms).toBe("Net 30");
        expect(
            await runtime.withTenantTransaction(
                { organizationId: f.first.id, userId: f.actor.id },
                (tx) =>
                    tx
                        .update(quoteRevisions)
                        .set({ version: 2, paymentTerms: "Stale" })
                        .where(and(eq(quoteRevisions.id, first.id), eq(quoteRevisions.version, 1)))
                        .returning(),
            ),
        ).toEqual([]);
        await expect(
            runtime.withTenantTransaction(
                { organizationId: f.first.id, userId: f.actor.id },
                (tx) =>
                    tx
                        .update(quotes)
                        .set({ version: 3, nextRevisionNumber: 3 })
                        .where(eq(quotes.id, quote.id)),
            ),
        ).rejects.toThrow();
        const [fresh] = await runtime.withTenantTransaction(
            { organizationId: f.first.id, userId: f.actor.id },
            (tx) => tx.select().from(quotes).where(eq(quotes.id, quote.id)),
        );
        expect(fresh!.nextRevisionNumber).toBe(2);
        expect(
            await runtime.withTenantTransaction(
                { organizationId: f.first.id, userId: f.actor.id },
                (tx) =>
                    tx
                        .update(quotes)
                        .set({ version: 3 })
                        .where(and(eq(quotes.id, quote.id), eq(quotes.version, 1)))
                        .returning(),
            ),
        ).toEqual([]);
        await expect(
            runtime.withTenantTransaction(
                { organizationId: f.first.id, userId: f.actor.id },
                (tx) =>
                    tx.insert(quoteRevisions).values({
                        organizationId: f.first.id,
                        quoteId: quote.id,
                        revisionNumber: 1,
                        sourceRequestVersion: 1,
                        currencyCode: "PEN",
                        currencyScale: 2,
                        createdByUserId: f.actor.id,
                    }),
            ),
        ).rejects.toThrow();
        expect(
            await runtime.withTenantTransaction(
                { organizationId: f.first.id, userId: f.actor.id },
                (tx) =>
                    tx.select().from(quoteRevisions).where(eq(quoteRevisions.quoteId, quote.id)),
            ),
        ).toHaveLength(1);
    });

    it("freezes exact issued money, snapshots and prior revisions", async () => {
        const f = await fixture();
        const quote = await createQuote(f);
        const revision = await createRevision(f, quote);
        const context = { organizationId: f.first.id, userId: f.actor.id };
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx.insert(quoteRevisionLines).values({
                    organizationId: f.first.id,
                    revisionId: revision.id,
                    currencyScale: 2,
                    position: 1,
                    description: "Excess quantity precision",
                    quantity: "1.0000001",
                    unit: "unit",
                    unitPrice: "1",
                }),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx.insert(quoteRevisionLines).values({
                    organizationId: f.first.id,
                    revisionId: revision.id,
                    currencyScale: 2,
                    position: 1,
                    description: "Foreign Party",
                    quantity: "1",
                    unit: "unit",
                    unitPrice: "1",
                    partyId: f.otherCustomer.id,
                }),
            ),
        ).rejects.toThrow();
        const [line] = await runtime.withTenantTransaction(context, async (tx) => {
            const [created] = await tx
                .insert(quoteRevisionLines)
                .values({
                    organizationId: f.first.id,
                    revisionId: revision.id,
                    currencyScale: 2,
                    position: 1,
                    description: "Inspect original pump",
                    quantity: "3",
                    unit: "unit",
                    unitPrice: "0.335",
                    roundedBaseAmount: "1.01",
                    totalAmount: "1.00",
                    assetId: f.asset.id,
                    assetSnapshot: { label: "Original Pump" },
                })
                .returning();
            await tx.insert(quoteLineAdjustments).values({
                organizationId: f.first.id,
                revisionId: revision.id,
                lineId: created!.id,
                currencyScale: 2,
                position: 1,
                label: "Discount",
                amount: "-0.01",
            });
            await tx.insert(quoteRevisionAdjustments).values({
                organizationId: f.first.id,
                revisionId: revision.id,
                currencyScale: 2,
                position: 1,
                label: "Service discount",
                amount: "-0.10",
            });
            return [created!];
        });
        const issuedAt = new Date("2026-09-25T12:00:00.000Z");
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .update(quoteRevisions)
                    .set({
                        status: "offered",
                        version: 2,
                        issuedAt,
                        issueChannel: "in_person",
                        issuedByUserId: f.actor.id,
                        customerSnapshot: { name: "Original Name" },
                        subtotal: "1.01",
                        total: "0.91",
                    })
                    .where(eq(quoteRevisions.id, revision.id)),
            ),
        ).rejects.toThrow();
        const [offered] = await runtime.withTenantTransaction(context, (tx) =>
            tx
                .update(quoteRevisions)
                .set({
                    status: "offered",
                    version: 2,
                    issuedAt,
                    issueChannel: "in_person",
                    issuedByUserId: f.actor.id,
                    customerSnapshot: { name: "Original Name" },
                    subtotal: "1.00",
                    total: "0.90",
                })
                .where(eq(quoteRevisions.id, revision.id))
                .returning(),
        );
        expect(offered!.total).toBe("0.90");
        expect(line.roundedBaseAmount).toBe("1.01");
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .update(quoteRevisionLines)
                    .set({ unitPrice: "9.00" })
                    .where(eq(quoteRevisionLines.id, line.id)),
            ),
        ).rejects.toThrow();
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx
                    .update(quoteRevisions)
                    .set({ version: 3, total: "9.00", status: "rejected" })
                    .where(eq(quoteRevisions.id, revision.id)),
            ),
        ).rejects.toThrow();
        await migrator.database
            .update(parties)
            .set({
                status: "archived",
                archivedAt: new Date(),
                displayName: "Renamed Customer",
            })
            .where(eq(parties.id, f.customer.id));
        await migrator.database
            .update(assets)
            .set({
                status: "archived",
                archivedAt: new Date(),
                displayName: "Renamed Pump",
            })
            .where(eq(assets.id, f.asset.id));
        const [historical] = await runtime.withTenantTransaction(context, (tx) =>
            tx.select().from(quoteRevisions).where(eq(quoteRevisions.id, revision.id)),
        );
        expect(historical!.customerSnapshot).toEqual({ name: "Original Name" });
        expect(historical!.total).toBe("0.90");
        const [historicalLine] = await runtime.withTenantTransaction(context, (tx) =>
            tx.select().from(quoteRevisionLines).where(eq(quoteRevisionLines.id, line.id)),
        );
        expect(historicalLine!.assetSnapshot).toEqual({ label: "Original Pump" });
        const [currentQuote] = await runtime.withTenantTransaction(context, (tx) =>
            tx.select().from(quotes).where(eq(quotes.id, quote.id)),
        );
        const next = await createRevision(f, currentQuote!, revision.id);
        expect(next.revisionNumber).toBe(2);
        expect(
            await runtime.withTenantTransaction(context, (tx) =>
                tx.select().from(quoteRevisions).where(eq(quoteRevisions.quoteId, quote.id)),
            ),
        ).toHaveLength(2);
    });

    it("blocks foreign associations and fails closed under RLS", async () => {
        const f = await fixture();
        const context = { organizationId: f.first.id, userId: f.actor.id };
        const rls = await migrator.database.execute<{
            relname: string;
            relrowsecurity: boolean;
            relforcerowsecurity: boolean;
        }>(sql`
            SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
            WHERE relname IN (
                'quotes', 'quote_revisions', 'quote_revision_lines',
                'quote_line_adjustments', 'quote_revision_adjustments'
            )
        `);
        expect(rls.rows).toHaveLength(5);
        expect(rls.rows.every((table) => table.relrowsecurity && table.relforcerowsecurity)).toBe(
            true,
        );
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx.insert(quotes).values({
                    organizationId: f.first.id,
                    requestId: f.otherRequest.id,
                    customerPartyId: f.customer.id,
                    reference: "Foreign request",
                    createdByUserId: f.actor.id,
                    updatedByUserId: f.actor.id,
                }),
            ),
        ).rejects.toThrow();
        const quote = await createQuote(f);
        const revision = await createRevision(f, quote);
        await expect(
            runtime.withTenantTransaction(context, (tx) =>
                tx.insert(quoteRevisionLines).values({
                    organizationId: f.first.id,
                    revisionId: revision.id,
                    currencyScale: 2,
                    position: 1,
                    description: "Foreign asset",
                    quantity: "1",
                    unit: "unit",
                    unitPrice: "1",
                    assetId: f.otherAsset.id,
                }),
            ),
        ).rejects.toThrow();
        expect(
            await runtime.withTenantTransaction(
                { organizationId: f.second.id, userId: f.otherActor.id },
                async (tx) => ({
                    quotes: await tx.select().from(quotes),
                    revisions: await tx.select().from(quoteRevisions),
                    lines: await tx.select().from(quoteRevisionLines),
                }),
            ),
        ).toEqual({ quotes: [], revisions: [], lines: [] });
        expect(
            await unpermissionedRuntime.withTenantTransaction(context, (tx) =>
                tx.select().from(quotes),
            ),
        ).toEqual([]);
        expect(await runtime.database.select().from(quotes)).toEqual([]);
        await expect(
            runtime.database.insert(quotes).values({
                organizationId: f.first.id,
                requestId: f.request.id,
                customerPartyId: f.customer.id,
                reference: "No context",
                createdByUserId: f.actor.id,
                updatedByUserId: f.actor.id,
            }),
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
        applicationName: "ardenfold-quotations-tests",
    });
}
