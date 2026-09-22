import { resolve } from "node:path";

import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "../index";
import {
    buildExternalIdentity,
    buildOrganization,
    buildOrganizationMembership,
    buildOrganizationSite,
    buildUser,
    resetDatabaseFactorySequence,
} from "../testing";
import {
    externalIdentities,
    organizationMemberships,
    organizations,
    organizationSites,
    users,
} from "./index";

const databaseTestUrl = process.env.DATABASE_TEST_URL;

if (process.env.CI === "true" && databaseTestUrl === undefined) {
    throw new Error("DATABASE_TEST_URL is required for database tests in CI.");
}

const describeWithDatabase = databaseTestUrl === undefined ? describe.skip : describe;

describeWithDatabase("identity and tenancy schema", () => {
    let connection: DatabaseConnection;

    beforeAll(async () => {
        if (databaseTestUrl === undefined) {
            return;
        }

        await resetTestDatabase(databaseTestUrl);

        connection = createDatabaseConnection({
            connectionString: databaseTestUrl,
            max: 4,
            idleTimeoutMillis: 5_000,
            connectionTimeoutMillis: 5_000,
            ssl: false,
            applicationName: "ardenfold-database-schema-tests",
        });

        const migrationsFolder = resolve(process.cwd(), "drizzle");

        await migrate(connection.database, { migrationsFolder });
        await migrate(connection.database, { migrationsFolder });
    });

    beforeEach(async () => {
        resetDatabaseFactorySequence();

        await connection.database.execute(sql`
            TRUNCATE TABLE
                ${externalIdentities},
                ${organizationMemberships},
                ${organizationSites},
                ${organizations},
                ${users}
            CASCADE
        `);
    });

    afterAll(async () => {
        await connection?.close();
    });

    it("applies migrations repeatedly to an empty database", async () => {
        const result = await connection.database.execute<{
            table_name: string;
        }>(sql`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN (
                'external_identities',
                'organization_memberships',
                'organization_sites',
                'organizations',
                'users'
              )
            ORDER BY table_name
        `);

        expect(result.rows.map((row) => row.table_name)).toEqual([
            "external_identities",
            "organization_memberships",
            "organization_sites",
            "organizations",
            "users",
        ]);
    });

    it("generates stable IDs and allows a user to join multiple organizations", async () => {
        const [user] = await connection.database
            .insert(users)
            .values(buildUser({ preferredLocale: "es", preferredTimeZone: "America/Lima" }))
            .returning();
        const createdOrganizations = await connection.database
            .insert(organizations)
            .values([buildOrganization(), buildOrganization()])
            .returning();

        await connection.database
            .insert(organizationMemberships)
            .values(
                createdOrganizations.map((organization) =>
                    buildOrganizationMembership(organization.id, user!.id),
                ),
            );

        const memberships = await connection.database
            .select()
            .from(organizationMemberships)
            .where(eq(organizationMemberships.userId, user!.id));

        expect(user!.id).toMatch(/^[0-9a-f-]{36}$/u);
        expect(memberships).toHaveLength(2);
        expect(user!.preferredLocale).toBe("es");
        expect(user!.preferredTimeZone).toBe("America/Lima");
    });

    it("keeps external identities separate and globally unique by provider identity", async () => {
        const [firstUser, secondUser] = await connection.database
            .insert(users)
            .values([buildUser(), buildUser()])
            .returning();
        const identity = buildExternalIdentity(firstUser!.id, {
            provider: "workos",
            issuer: "https://api.workos.com/",
            subject: "user_01EXAMPLE",
        });

        await connection.database.insert(externalIdentities).values(identity);

        await expectDatabaseError(
            connection.database.insert(externalIdentities).values({
                ...identity,
                userId: secondUser!.id,
            }),
            "23505",
            "external_identities_provider_issuer_subject_uidx",
        );
    });

    it("prevents duplicate organization memberships", async () => {
        const [organization] = await connection.database
            .insert(organizations)
            .values(buildOrganization())
            .returning();
        const [user] = await connection.database.insert(users).values(buildUser()).returning();
        const membership = buildOrganizationMembership(organization!.id, user!.id);

        await connection.database.insert(organizationMemberships).values(membership);

        await expectDatabaseError(
            connection.database.insert(organizationMemberships).values(membership),
            "23505",
            "organization_memberships_organization_id_user_id_uidx",
        );
    });

    it("enforces membership lifecycle timestamps", async () => {
        const [organization] = await connection.database
            .insert(organizations)
            .values(buildOrganization())
            .returning();
        const [user] = await connection.database.insert(users).values(buildUser()).returning();

        await expectDatabaseError(
            connection.database.insert(organizationMemberships).values(
                buildOrganizationMembership(organization!.id, user!.id, {
                    status: "suspended",
                }),
            ),
            "23514",
            "organization_memberships_lifecycle_check",
        );

        const [membership] = await connection.database
            .insert(organizationMemberships)
            .values(
                buildOrganizationMembership(organization!.id, user!.id, {
                    status: "suspended",
                    suspendedAt: new Date(),
                }),
            )
            .returning();

        expect(membership!.status).toBe("suspended");
        expect(membership!.suspendedAt).toBeInstanceOf(Date);
    });

    it("scopes optional site codes to an organization", async () => {
        const [firstOrganization, secondOrganization] = await connection.database
            .insert(organizations)
            .values([buildOrganization(), buildOrganization()])
            .returning();

        await connection.database
            .insert(organizationSites)
            .values([
                buildOrganizationSite(firstOrganization!.id, { code: "MAIN" }),
                buildOrganizationSite(secondOrganization!.id, { code: "MAIN" }),
            ]);

        await expectDatabaseError(
            connection.database
                .insert(organizationSites)
                .values(buildOrganizationSite(firstOrganization!.id, { code: "MAIN" })),
            "23505",
            "organization_sites_organization_id_code_uidx",
        );
    });

    it("creates tenant-oriented lookup indexes", async () => {
        const result = await connection.database.execute<{ indexname: string }>(sql`
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname IN (
                'external_identities_user_id_idx',
                'organization_memberships_organization_id_status_idx',
                'organization_memberships_user_id_status_idx',
                'organization_sites_organization_id_idx'
              )
            ORDER BY indexname
        `);

        expect(result.rows.map((row) => row.indexname)).toEqual([
            "external_identities_user_id_idx",
            "organization_memberships_organization_id_status_idx",
            "organization_memberships_user_id_status_idx",
            "organization_sites_organization_id_idx",
        ]);
    });
});

async function resetTestDatabase(connectionString: string): Promise<void> {
    const pool = new Pool({ connectionString, max: 1 });

    try {
        const databaseNameResult = await pool.query<{ current_database: string }>(
            "SELECT current_database()",
        );
        const databaseName = databaseNameResult.rows[0]?.current_database;

        if (databaseName === undefined || !databaseName.endsWith("_test")) {
            throw new Error(
                `Refusing to reset database '${databaseName ?? "unknown"}'; its name must end with _test.`,
            );
        }

        await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
        await pool.query("DROP SCHEMA public CASCADE");
        await pool.query("CREATE SCHEMA public");
    } finally {
        await pool.end();
    }
}

async function expectDatabaseError(
    operation: Promise<unknown>,
    code: string,
    constraint: string,
): Promise<void> {
    let received: unknown;

    try {
        await operation;
    } catch (error: unknown) {
        received = error;
    }

    expect(received).toBeInstanceOf(Error);
    expect((received as Error & { cause?: unknown }).cause).toMatchObject({
        code,
        constraint,
    });
}
