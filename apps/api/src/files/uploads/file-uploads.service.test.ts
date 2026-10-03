import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { ConfigService } from "@nestjs/config";
import { createDatabaseConnection, type DatabaseConnection } from "@ardenfold/database";
import {
    auditEvents,
    organizationMemberships,
    organizations,
    storedObjects,
    systemOrganizationRoleIds,
    users,
} from "@ardenfold/database/schema";
import { runWithCorrelationContext } from "@ardenfold/observability";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { OrganizationAuthorizationService } from "../../auth/authorization/organization-authorization.service";
import type { EnvironmentVariables } from "../../config/environment";
import type { DatabaseService } from "../../infrastructure/database/database.service";
import { PrivateObjectStore } from "../storage/private-object-store";
import { FileUploadsService } from "./file-uploads.service";
import { sha256 } from "./file-content";

const image =
    "ghcr.io/versity/versitygw@sha256:30292fc2eeacc67a36993b01f7a7a5e3361a19cced0e80c1d71cfa2a4b0a2499";

function connection(url: string): DatabaseConnection {
    return createDatabaseConnection({
        connectionString: url,
        max: 4,
        idleTimeoutMillis: 1_000,
        connectionTimeoutMillis: 5_000,
        ssl: false,
        applicationName: "file-upload-integration-test",
    });
}

describe("authorized file upload lifecycle", () => {
    let postgres: StartedPostgreSqlContainer;
    let gateway: StartedTestContainer;
    let owner: DatabaseConnection;
    let runtime: DatabaseConnection;
    let client: S3Client;
    let uploads: FileUploadsService;

    beforeAll(async () => {
        postgres = await new PostgreSqlContainer("postgres:18.6-bookworm")
            .withDatabase("ardenfold_file_upload_test")
            .withUsername("ardenfold_migrator")
            .withPassword("ardenfold_migrator_password")
            .start();
        owner = connection(postgres.getConnectionUri());
        await migrate(owner.database, {
            migrationsFolder: resolve(process.cwd(), "../../packages/database/drizzle"),
        });
        await owner.database.execute(
            "CREATE ROLE ardenfold_file_upload_runtime LOGIN PASSWORD 'file_upload_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
        );
        await owner.database.execute("GRANT ardenfold_runtime TO ardenfold_file_upload_runtime");
        const url = new URL(postgres.getConnectionUri());
        url.username = "ardenfold_file_upload_runtime";
        url.password = "file_upload_password";
        runtime = connection(url.toString());
        gateway = await new GenericContainer(image)
            .withEnvironment({
                ROOT_ACCESS_KEY: "file-test-key",
                ROOT_SECRET_KEY: "file-test-secret",
                VGW_BACKEND: "posix",
                VGW_BACKEND_ARGS: "/tmp",
                VGW_PORT: ":7070",
            })
            .withExposedPorts(7070)
            .start();
        const endpoint = `http://${gateway.getHost()}:${gateway.getMappedPort(7070)}`;
        client = new S3Client({
            region: "us-east-1",
            endpoint,
            forcePathStyle: true,
            credentials: { accessKeyId: "file-test-key", secretAccessKey: "file-test-secret" },
        });
        await client.send(new CreateBucketCommand({ Bucket: "ardenfold-file-upload-test" }));
        const settings = {
            FILE_STORAGE_ENDPOINT: endpoint,
            FILE_STORAGE_REGION: "us-east-1",
            FILE_STORAGE_BUCKET: "ardenfold-file-upload-test",
            FILE_STORAGE_ACCESS_KEY_ID: "file-test-key",
            FILE_STORAGE_SECRET_ACCESS_KEY: "file-test-secret",
        };
        const store = new PrivateObjectStore({
            get: (key: keyof typeof settings) => settings[key],
        } as ConfigService<EnvironmentVariables, true>);
        const authorization = new OrganizationAuthorizationService({
            withTenantTransaction: runtime.withTenantTransaction,
            withUserTransaction: runtime.withUserTransaction,
        } as DatabaseService);
        uploads = new FileUploadsService(authorization, store);
    }, 60_000);

    afterAll(async () => {
        client?.destroy();
        await runtime?.close();
        await owner?.close();
        await gateway?.stop();
        await postgres?.stop();
    });

    it("verifies bytes and retries while denying other tenants and suspended members", async () => {
        const [org, otherOrg] = await owner.database
            .insert(organizations)
            .values([{ name: "Upload org" }, { name: "Other upload org" }])
            .returning();
        const [user, otherUser] = await owner.database
            .insert(users)
            .values([
                { primaryEmail: "upload@example.test" },
                { primaryEmail: "other-upload@example.test" },
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
        const principal = { user } as AuthenticatedPrincipal;
        const otherPrincipal = { user: otherUser } as AuthenticatedPrincipal;
        const bytes = Buffer.from("field observation\n");
        const input = {
            idempotencyKey: randomUUID(),
            filename: "../../field.txt",
            mediaType: "text/plain" as const,
            byteLength: bytes.length,
            sha256: sha256(bytes),
        };
        await runWithCorrelationContext({ correlationId: randomUUID() }, async () => {
            const pending = await uploads.reserve(principal, org!.id, input);
            expect(pending.status).toBe("pending");
            expect(pending.filename).toBe("field.txt");
            expect((await uploads.reserve(principal, org!.id, input)).id).toBe(pending.id);
            await expect(
                uploads.reserve(principal, org!.id, { ...input, sha256: "0".repeat(64) }),
            ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
            await expect(
                uploads.upload(principal, org!.id, pending.id, Buffer.from("wrong")),
            ).rejects.toMatchObject({ code: "UPLOAD_MISMATCH" });
            expect((await uploads.upload(principal, org!.id, pending.id, bytes)).status).toBe(
                "uploaded",
            );
            expect((await uploads.upload(principal, org!.id, pending.id, bytes)).status).toBe(
                "uploaded",
            );
            expect((await uploads.finalize(principal, org!.id, pending.id)).status).toBe(
                "finalized",
            );
            expect((await uploads.finalize(principal, org!.id, pending.id)).sha256).toBe(
                input.sha256,
            );
            expect((await uploads.download(principal, org!.id, pending.id)).bytes).toEqual(bytes);
            await expect(
                uploads.download(otherPrincipal, otherOrg!.id, pending.id),
            ).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
            await expect(uploads.download(principal, org!.id, randomUUID())).rejects.toMatchObject({
                code: "FILE_NOT_FOUND",
            });
            const [row] = await owner.database
                .select()
                .from(storedObjects)
                .where(eq(storedObjects.id, pending.id));
            expect(row?.sha256).toBe(input.sha256);
            expect(row?.storageKey).not.toContain("field.txt");
            const audit = await owner.database
                .select()
                .from(auditEvents)
                .where(
                    and(
                        eq(auditEvents.organizationId, org!.id),
                        eq(auditEvents.resourceId, pending.id),
                    ),
                );
            expect(audit.map((event) => event.action).sort()).toEqual([
                "file.finalized",
                "file.upload_requested",
                "file.uploaded",
            ]);
            await owner.database
                .update(storedObjects)
                .set({ retainedAt: new Date() })
                .where(eq(storedObjects.id, pending.id));
            await expect(uploads.download(principal, org!.id, pending.id)).rejects.toMatchObject({
                code: "FILE_NOT_FOUND",
            });
            const orphan = await uploads.reserve(principal, org!.id, {
                ...input,
                idempotencyKey: randomUUID(),
            });
            await uploads.upload(principal, org!.id, orphan.id, bytes);
            expect(
                await uploads.abandonExpired(principal, org!.id, new Date(Date.now() + 60_000)),
            ).toBe(1);
            expect(
                (
                    await owner.database
                        .select()
                        .from(storedObjects)
                        .where(eq(storedObjects.id, orphan.id))
                )[0]?.status,
            ).toBe("abandoned");
            await expect(uploads.finalize(principal, org!.id, orphan.id)).rejects.toMatchObject({
                code: "UPLOAD_INCOMPLETE",
            });
            expect(
                await uploads.abandonExpired(principal, org!.id, new Date(Date.now() + 60_000)),
            ).toBe(1);
            expect(
                (
                    await owner.database
                        .select()
                        .from(storedObjects)
                        .where(eq(storedObjects.id, pending.id))
                )[0]?.status,
            ).toBe("finalized");
            await owner.database
                .update(organizationMemberships)
                .set({ status: "suspended", suspendedAt: new Date() })
                .where(eq(organizationMemberships.userId, user!.id));
            await expect(uploads.download(principal, org!.id, pending.id)).rejects.toMatchObject({
                code: "ORGANIZATION_ACCESS_DENIED",
            });
        });
    });
});
