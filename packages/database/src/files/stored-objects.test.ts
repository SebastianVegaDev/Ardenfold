import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "../index";
import {
    organizationMemberships,
    organizations,
    storedObjects,
    systemOrganizationRoleIds,
    users,
} from "../schema";

function connection(url: string): DatabaseConnection {
    return createDatabaseConnection({
        connectionString: url,
        max: 4,
        idleTimeoutMillis: 1_000,
        connectionTimeoutMillis: 5_000,
        ssl: false,
        applicationName: "stored-object-security-test",
    });
}

describe("stored-object tenant and lifecycle constraints", () => {
    let owner: DatabaseConnection;
    let runtime: DatabaseConnection;
    let container: StartedPostgreSqlContainer | undefined;

    beforeAll(async () => {
        let url = process.env.DATABASE_TEST_URL;
        if (!url) {
            container = await new PostgreSqlContainer("postgres:18.6-bookworm")
                .withDatabase("ardenfold_files_test")
                .withUsername("ardenfold_migrator")
                .withPassword("ardenfold_migrator_password")
                .start();
            url = container.getConnectionUri();
        }
        const pool = new Pool({ connectionString: url });
        try {
            await pool.query("DROP SCHEMA public CASCADE");
            await pool.query("CREATE SCHEMA public");
        } finally {
            await pool.end();
        }
        owner = connection(url);
        await migrate(owner.database, { migrationsFolder: resolve(process.cwd(), "drizzle") });
        await owner.database.execute(
            sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ardenfold_files_runtime') THEN CREATE ROLE ardenfold_files_runtime LOGIN PASSWORD 'ardenfold_files_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$`,
        );
        await owner.database.execute(sql`GRANT ardenfold_runtime TO ardenfold_files_runtime`);
        const runtimeUrl = new URL(url);
        runtimeUrl.username = "ardenfold_files_runtime";
        runtimeUrl.password = "ardenfold_files_password";
        runtime = connection(runtimeUrl.toString());
    });

    afterAll(async () => {
        await runtime?.close();
        await owner?.close();
        await container?.stop();
    });

    it("forces tenant and membership checks and preserves retained metadata", async () => {
        const [org, otherOrg] = await owner.database
            .insert(organizations)
            .values([{ name: "Files tenant" }, { name: "Other files tenant" }])
            .returning();
        const [user, otherUser] = await owner.database
            .insert(users)
            .values([
                { primaryEmail: "files@example.test" },
                { primaryEmail: "other-files@example.test" },
            ])
            .returning();
        await owner.database.insert(organizationMemberships).values([
            {
                organizationId: org!.id,
                userId: user!.id,
                roleId: systemOrganizationRoleIds.owner,
                status: "active",
            },
            {
                organizationId: otherOrg!.id,
                userId: otherUser!.id,
                roleId: systemOrganizationRoleIds.owner,
                status: "active",
            },
        ]);
        const id = randomUUID();
        const insert = {
            id,
            organizationId: org!.id,
            storageKey: `${org!.id}/${randomUUID()}`,
            originalFilename: "report.txt",
            declaredMediaType: "text/plain",
            expectedByteLength: 3,
            expectedSha256: "a".repeat(64),
            idempotencyKey: randomUUID(),
            requestHash: "b".repeat(64),
            uploadedByUserId: user!.id,
        };
        await runtime.withTenantTransaction(
            { organizationId: org!.id, userId: user!.id },
            async (tx) => {
                await tx.execute(
                    sql`SELECT set_config('ardenfold.permission.files.upload', 'true', true)`,
                );
                await tx.insert(storedObjects).values(insert);
            },
        );
        const wrongTenant = await runtime.withTenantTransaction(
            { organizationId: otherOrg!.id, userId: otherUser!.id },
            async (tx) => {
                await tx.execute(
                    sql`SELECT set_config('ardenfold.permission.files.read', 'true', true)`,
                );
                return tx.select().from(storedObjects).where(eq(storedObjects.id, id));
            },
        );
        expect(wrongTenant).toEqual([]);
        await expect(
            runtime.withTenantTransaction(
                { organizationId: otherOrg!.id, userId: otherUser!.id },
                async (tx) => {
                    await tx.execute(
                        sql`SELECT set_config('ardenfold.permission.files.upload', 'true', true)`,
                    );
                    return tx.insert(storedObjects).values({
                        ...insert,
                        id: randomUUID(),
                        storageKey: `${otherOrg!.id}/${randomUUID()}`,
                        idempotencyKey: randomUUID(),
                    });
                },
            ),
        ).rejects.toThrow();
        await runtime.withTenantTransaction(
            { organizationId: org!.id, userId: user!.id },
            async (tx) => {
                await tx.execute(
                    sql`SELECT set_config('ardenfold.permission.files.upload', 'true', true)`,
                );
                await tx
                    .update(storedObjects)
                    .set({
                        status: "uploaded",
                        mediaType: "text/plain",
                        byteLength: 3,
                        sha256: "a".repeat(64),
                        uploadedAt: new Date(),
                    })
                    .where(eq(storedObjects.id, id));
                await tx
                    .update(storedObjects)
                    .set({ status: "finalized", finalizedAt: new Date() })
                    .where(eq(storedObjects.id, id));
                await tx
                    .update(storedObjects)
                    .set({ retainedAt: new Date() })
                    .where(eq(storedObjects.id, id));
            },
        );
        await expect(
            runtime.withTenantTransaction(
                { organizationId: org!.id, userId: user!.id },
                async (tx) => {
                    await tx.execute(
                        sql`SELECT set_config('ardenfold.permission.files.upload', 'true', true)`,
                    );
                    await tx
                        .update(storedObjects)
                        .set({ status: "abandoned", abandonedAt: new Date() })
                        .where(eq(storedObjects.id, id));
                },
            ),
        ).rejects.toThrow();
        const [retained] = await owner.database
            .select()
            .from(storedObjects)
            .where(eq(storedObjects.id, id));
        expect(retained?.status).toBe("finalized");
        await owner.database
            .update(organizationMemberships)
            .set({ status: "suspended", suspendedAt: new Date() })
            .where(eq(organizationMemberships.userId, user!.id));
        const afterSuspension = await runtime.withTenantTransaction(
            { organizationId: org!.id, userId: user!.id },
            async (tx) => {
                await tx.execute(
                    sql`SELECT set_config('ardenfold.permission.files.read', 'true', true)`,
                );
                return tx.select().from(storedObjects).where(eq(storedObjects.id, id));
            },
        );
        expect(afterSuspension).toEqual([]);
    });
});
