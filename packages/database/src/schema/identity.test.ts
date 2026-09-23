import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
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
    buildParty,
    buildPartyContact,
    buildPartyIdentifier,
    buildUser,
    resetDatabaseFactorySequence,
} from "../testing";
import {
    auditEvents,
    externalIdentities,
    organizationMemberships,
    organizationInvitations,
    organizationRolePermissions,
    organizationRoles,
    organizations,
    organizationSites,
    permissions,
    parties,
    partyRoles,
    partyIdentifiers,
    partyContacts,
    partyContactChannels,
    partyAddresses,
    systemOrganizationRoleIds,
    users,
} from "./index";

describe("identity, tenancy and row-level security", () => {
    let connection: DatabaseConnection;
    let runtimeConnection: DatabaseConnection;
    let postgresContainer: StartedPostgreSqlContainer | undefined;

    beforeAll(async () => {
        let databaseTestUrl = process.env.DATABASE_TEST_URL;

        if (databaseTestUrl === undefined) {
            postgresContainer = await new PostgreSqlContainer("postgres:18.6-bookworm")
                .withDatabase("ardenfold_test")
                .withUsername("ardenfold_migrator")
                .withPassword("ardenfold_migrator_password")
                .start();
            databaseTestUrl = postgresContainer.getConnectionUri();
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

        await provisionRuntimeLogin(connection);

        runtimeConnection = createDatabaseConnection({
            connectionString: createRuntimeConnectionUrl(databaseTestUrl),
            max: 1,
            idleTimeoutMillis: 5_000,
            connectionTimeoutMillis: 5_000,
            ssl: false,
            applicationName: "ardenfold-database-rls-tests",
        });
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
        await runtimeConnection?.close();
        await connection?.close();
        await postgresContainer?.stop();
    });

    it("applies migrations repeatedly to an empty database", async () => {
        const result = await connection.database.execute<{
            table_name: string;
        }>(sql`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN (
                'audit_events',
                'external_identities',
                'organization_memberships',
                'organization_invitations',
                'organization_role_permissions',
                'organization_roles',
                'organization_sites',
                'organizations',
                'parties',
                'party_addresses',
                'party_contact_channels',
                'party_contacts',
                'party_identifiers',
                'party_roles',
                'permissions',
                'users'
              )
            ORDER BY table_name
        `);

        expect(result.rows.map((row) => row.table_name)).toEqual([
            "audit_events",
            "external_identities",
            "organization_invitations",
            "organization_memberships",
            "organization_role_permissions",
            "organization_roles",
            "organization_sites",
            "organizations",
            "parties",
            "party_addresses",
            "party_contact_channels",
            "party_contacts",
            "party_identifiers",
            "party_roles",
            "permissions",
            "users",
        ]);
    });

    it("persists the stable role and permission catalog", async () => {
        const roles = await connection.database
            .select({ key: organizationRoles.key })
            .from(organizationRoles)
            .orderBy(organizationRoles.key);
        const catalog = await connection.database
            .select({ code: permissions.code })
            .from(permissions)
            .orderBy(permissions.code);
        const viewerPermissions = await connection.database
            .select({ code: organizationRolePermissions.permissionCode })
            .from(organizationRolePermissions)
            .where(eq(organizationRolePermissions.roleId, systemOrganizationRoleIds.viewer))
            .orderBy(organizationRolePermissions.permissionCode);

        expect(roles.map((role) => role.key)).toEqual([
            "administrator",
            "member",
            "owner",
            "viewer",
        ]);
        expect(catalog).toHaveLength(16);
        expect(viewerPermissions.map((permission) => permission.code)).toEqual([
            "assets.read",
            "organization.read",
            "parties.read",
            "sites.read",
        ]);
    });

    it("lists only active organizations for the authenticated local user", async () => {
        const fixture = await seedTenantIsolationFixture(connection);

        const visible = await runtimeConnection.withUserTransaction(
            fixture.firstUserId,
            async (transaction) => {
                return transaction
                    .select({ organization_id: organizations.id })
                    .from(organizationMemberships)
                    .innerJoin(
                        organizations,
                        eq(organizations.id, organizationMemberships.organizationId),
                    );
            },
        );

        expect(visible).toEqual([{ organization_id: fixture.firstOrganizationId }]);
    });

    it("requires active membership even when an organization header supplies a real tenant ID", async () => {
        const fixture = await seedTenantIsolationFixture(connection);

        const visible = await runtimeConnection.withTenantTransaction(
            {
                organizationId: fixture.secondOrganizationId,
                userId: fixture.firstUserId,
            },
            (transaction) => transaction.select().from(organizations),
        );

        expect(visible).toEqual([]);
    });

    it("creates an organization and its initial owner atomically through bootstrap context", async () => {
        const [user] = await connection.database.insert(users).values(buildUser()).returning();
        const organizationId = "00000000-0000-4000-8000-000000000099";

        await runtimeConnection.withOrganizationBootstrapTransaction(
            { organizationId, userId: user!.id },
            async (transaction) => {
                await transaction.insert(organizations).values({
                    id: organizationId,
                    name: "Bootstrap organization",
                });
                await transaction.insert(organizationMemberships).values({
                    organizationId,
                    userId: user!.id,
                    roleId: systemOrganizationRoleIds.owner,
                });
            },
        );

        const membership = await connection.database
            .select()
            .from(organizationMemberships)
            .where(eq(organizationMemberships.organizationId, organizationId));
        expect(membership).toHaveLength(1);
        expect(membership[0]?.roleId).toBe(systemOrganizationRoleIds.owner);
    });

    it("allows an exact invitation capability to create only its intended membership", async () => {
        const [organization] = await connection.database
            .insert(organizations)
            .values(buildOrganization())
            .returning();
        const [inviter, invitee] = await connection.database
            .insert(users)
            .values([buildUser(), buildUser()])
            .returning();
        const tokenHash = "a".repeat(64);

        await connection.database.insert(organizationInvitations).values({
            organizationId: organization!.id,
            email: invitee!.primaryEmail,
            roleId: systemOrganizationRoleIds.member,
            tokenHash,
            invitedByUserId: inviter!.id,
            expiresAt: new Date(Date.now() + 60_000),
        });

        await runtimeConnection.withInvitationTransaction(tokenHash, async (transaction) => {
            const [invitation] = await transaction
                .select()
                .from(organizationInvitations)
                .where(eq(organizationInvitations.tokenHash, tokenHash));

            expect(invitation?.organizationId).toBe(organization!.id);
            await transaction.execute(sql`
                SELECT
                    set_config('ardenfold.organization_id', ${organization!.id}, true),
                    set_config('ardenfold.user_id', ${invitee!.id}, true),
                    set_config('ardenfold.invitation_role_id', ${systemOrganizationRoleIds.member}, true)
            `);
            await transaction.insert(organizationMemberships).values({
                organizationId: organization!.id,
                userId: invitee!.id,
                roleId: systemOrganizationRoleIds.member,
            });
        });

        const memberships = await connection.database
            .select()
            .from(organizationMemberships)
            .where(eq(organizationMemberships.userId, invitee!.id));
        expect(memberships).toHaveLength(1);
    });

    it("keeps audit events tenant-isolated and immutable for the runtime role", async () => {
        const fixture = await seedTenantIsolationFixture(connection);
        const traceId = "00000000-0000-4000-8000-000000000777";
        let auditEventId = "";

        await runtimeConnection.withTenantTransaction(
            { organizationId: fixture.firstOrganizationId, userId: fixture.firstUserId },
            async (transaction) => {
                await transaction.execute(sql`
                    SELECT set_config('ardenfold.permission.audit.read', 'true', true)
                `);
                await transaction.insert(auditEvents).values({
                    organizationId: fixture.firstOrganizationId,
                    actorType: "user",
                    actorUserId: fixture.firstUserId,
                    action: "organization.updated",
                    resourceType: "organization",
                    resourceId: fixture.firstOrganizationId,
                    traceId,
                    metadata: { fields: "name" },
                });
                const visible = await transaction.select().from(auditEvents);
                auditEventId = visible[0]!.id;
                expect(visible).toHaveLength(1);
            },
        );

        await runtimeConnection.withTenantTransaction(
            { organizationId: fixture.secondOrganizationId, userId: fixture.firstUserId },
            async (transaction) => {
                await transaction.execute(sql`
                    SELECT set_config('ardenfold.permission.audit.read', 'true', true)
                `);
                expect(await transaction.select().from(auditEvents)).toEqual([]);
            },
        );

        await expectDatabaseError(
            runtimeConnection.withTenantTransaction(
                { organizationId: fixture.firstOrganizationId, userId: fixture.firstUserId },
                (transaction) =>
                    transaction
                        .update(auditEvents)
                        .set({ resourceId: "tampered" })
                        .where(eq(auditEvents.id, auditEventId)),
            ),
            "42501",
            undefined,
        );
        await expectDatabaseError(
            runtimeConnection.withTenantTransaction(
                { organizationId: fixture.firstOrganizationId, userId: fixture.firstUserId },
                (transaction) =>
                    transaction.delete(auditEvents).where(eq(auditEvents.id, auditEventId)),
            ),
            "42501",
            undefined,
        );
    });

    it("rolls audit events back with their protected transaction", async () => {
        const fixture = await seedTenantIsolationFixture(connection);

        await expect(
            runtimeConnection.withTenantTransaction(
                { organizationId: fixture.firstOrganizationId, userId: fixture.firstUserId },
                async (transaction) => {
                    await transaction.insert(auditEvents).values({
                        organizationId: fixture.firstOrganizationId,
                        actorType: "user",
                        actorUserId: fixture.firstUserId,
                        action: "organization.updated",
                        resourceType: "organization",
                        resourceId: fixture.firstOrganizationId,
                        traceId: "00000000-0000-4000-8000-000000000778",
                    });
                    throw new Error("rollback audited operation");
                },
            ),
        ).rejects.toThrow("rollback audited operation");

        expect(await connection.database.select().from(auditEvents)).toEqual([]);
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

    it("keeps the runtime role non-owner and unable to bypass row-level security", async () => {
        const roleResult = await connection.database.execute<{
            rolcreaterole: boolean;
            rolcreatedb: boolean;
            rolname: string;
            rolowner: boolean;
            rolreplication: boolean;
            rolbypassrls: boolean;
            rolsuper: boolean;
        }>(sql`
            SELECT
                role.rolname,
                role.rolsuper,
                role.rolcreatedb,
                role.rolcreaterole,
                role.rolreplication,
                role.rolbypassrls,
                EXISTS (
                    SELECT 1
                    FROM pg_class relation
                    WHERE relation.relname IN (
                        'organization_memberships',
                        'organization_sites',
                        'organizations'
                    )
                      AND relation.relowner = role.oid
                ) AS rolowner
            FROM pg_roles role
            WHERE role.rolname = 'ardenfold_test_runtime'
        `);

        expect(roleResult.rows).toEqual([
            {
                rolname: "ardenfold_test_runtime",
                rolsuper: false,
                rolcreatedb: false,
                rolcreaterole: false,
                rolreplication: false,
                rolbypassrls: false,
                rolowner: false,
            },
        ]);

        const policyResult = await connection.database.execute<{
            relforcerowsecurity: boolean;
            relname: string;
            relrowsecurity: boolean;
        }>(sql`
            SELECT relname, relrowsecurity, relforcerowsecurity
            FROM pg_class
            WHERE relname IN (
                'organization_memberships',
                'organization_sites',
                'organizations'
            )
            ORDER BY relname
        `);

        expect(policyResult.rows).toEqual([
            {
                relname: "organization_memberships",
                relrowsecurity: true,
                relforcerowsecurity: true,
            },
            {
                relname: "organization_sites",
                relrowsecurity: true,
                relforcerowsecurity: true,
            },
            {
                relname: "organizations",
                relrowsecurity: true,
                relforcerowsecurity: true,
            },
        ]);
    });

    it("fails closed when tenant context is missing", async () => {
        const fixture = await seedTenantIsolationFixture(connection);

        const organizationsWithoutContext = await runtimeConnection.database
            .select()
            .from(organizations);
        const sitesWithoutContext = await runtimeConnection.database
            .select()
            .from(organizationSites);

        expect(organizationsWithoutContext).toEqual([]);
        expect(sitesWithoutContext).toEqual([]);

        await expectDatabaseError(
            runtimeConnection.database.insert(organizationSites).values({
                organizationId: fixture.firstOrganizationId,
                name: "Missing context",
            }),
            "42501",
            undefined,
        );
    });

    it("isolates tenant reads, inserts, updates and deletes", async () => {
        const fixture = await seedTenantIsolationFixture(connection);

        await runtimeConnection.withTenantTransaction(
            {
                organizationId: fixture.firstOrganizationId,
                userId: fixture.firstUserId,
            },
            async (transaction) => {
                const visibleOrganizations = await transaction.select().from(organizations);
                const visibleSites = await transaction.select().from(organizationSites);

                expect(visibleOrganizations.map((organization) => organization.id)).toEqual([
                    fixture.firstOrganizationId,
                ]);
                expect(visibleSites.map((site) => site.organizationId)).toEqual([
                    fixture.firstOrganizationId,
                ]);

                const [createdSite] = await transaction
                    .insert(organizationSites)
                    .values({
                        organizationId: fixture.firstOrganizationId,
                        name: "Authorized site",
                    })
                    .returning();

                expect(createdSite!.organizationId).toBe(fixture.firstOrganizationId);

                const updated = await transaction
                    .update(organizationSites)
                    .set({ name: "Cross-tenant update" })
                    .where(eq(organizationSites.organizationId, fixture.secondOrganizationId))
                    .returning();
                const deleted = await transaction
                    .delete(organizationSites)
                    .where(eq(organizationSites.organizationId, fixture.secondOrganizationId))
                    .returning();

                expect(updated).toEqual([]);
                expect(deleted).toEqual([]);
            },
        );

        await expectDatabaseError(
            runtimeConnection.withTenantTransaction(
                {
                    organizationId: fixture.firstOrganizationId,
                    userId: fixture.firstUserId,
                },
                async (transaction) =>
                    transaction.insert(organizationSites).values({
                        organizationId: fixture.secondOrganizationId,
                        name: "Cross-tenant insert",
                    }),
            ),
            "42501",
            undefined,
        );

        const [secondTenantSite] = await connection.database
            .select()
            .from(organizationSites)
            .where(eq(organizationSites.organizationId, fixture.secondOrganizationId));

        expect(secondTenantSite!.name).toBe("Second tenant site");
    });

    it("keeps organization and user context local to one pooled transaction", async () => {
        const fixture = await seedTenantIsolationFixture(connection);

        await runtimeConnection.withTenantTransaction(
            {
                organizationId: fixture.firstOrganizationId,
                userId: fixture.firstUserId,
            },
            async (transaction) => {
                const result = await transaction.execute<{
                    organization_id: string;
                    user_id: string;
                }>(sql`
                    SELECT
                        current_setting('ardenfold.organization_id', true) AS organization_id,
                        current_setting('ardenfold.user_id', true) AS user_id
                `);

                expect(result.rows).toEqual([
                    {
                        organization_id: fixture.firstOrganizationId,
                        user_id: fixture.firstUserId,
                    },
                ]);
            },
        );

        await expect(
            runtimeConnection.withTenantTransaction(
                {
                    organizationId: fixture.firstOrganizationId,
                    userId: fixture.firstUserId,
                },
                () => Promise.reject(new Error("force transaction rollback")),
            ),
        ).rejects.toThrow("force transaction rollback");

        const leakedContext = await runtimeConnection.database.execute<{
            organization_id: string | null;
            user_id: string | null;
        }>(sql`
            SELECT
                NULLIF(current_setting('ardenfold.organization_id', true), '') AS organization_id,
                NULLIF(current_setting('ardenfold.user_id', true), '') AS user_id
        `);
        const visibleSites = await runtimeConnection.database.select().from(organizationSites);

        expect(leakedContext.rows).toEqual([{ organization_id: null, user_id: null }]);
        expect(visibleSites).toEqual([]);
    });

    it("rejects malformed tenant context before opening a transaction", async () => {
        await expect(
            runtimeConnection.withTenantTransaction(
                {
                    organizationId: "not-a-uuid",
                    userId: "also-not-a-uuid",
                },
                () => Promise.resolve(undefined),
            ),
        ).rejects.toThrow(/organizationId/u);
    });

    it("isolates party records and permits matching identifiers in separate organizations", async () => {
        const fixture = await seedTenantIsolationFixture(connection);
        const [firstParty] = await connection.database
            .insert(parties)
            .values(buildParty(fixture.firstOrganizationId))
            .returning();
        const [secondParty] = await connection.database
            .insert(parties)
            .values(buildParty(fixture.secondOrganizationId))
            .returning();

        await connection.database.insert(partyRoles).values([
            {
                organizationId: fixture.firstOrganizationId,
                partyId: firstParty!.id,
                role: "customer",
            },
            {
                organizationId: fixture.firstOrganizationId,
                partyId: firstParty!.id,
                role: "provider",
            },
        ]);
        await connection.database.insert(partyIdentifiers).values([
            buildPartyIdentifier(fixture.firstOrganizationId, firstParty!.id, {
                originalValue: "Tax 42",
                normalizedValue: "TAX42",
            }),
            buildPartyIdentifier(fixture.secondOrganizationId, secondParty!.id, {
                originalValue: "Tax 42",
                normalizedValue: "TAX42",
            }),
        ]);

        await runtimeConnection.withTenantTransaction(
            { organizationId: fixture.firstOrganizationId, userId: fixture.firstUserId },
            async (transaction) => {
                await transaction.execute(
                    sql`SELECT set_config('ardenfold.permission.parties.read', 'true', true)`,
                );
                expect((await transaction.select().from(parties)).map((party) => party.id)).toEqual(
                    [firstParty!.id],
                );
                expect(
                    (await transaction.select().from(partyIdentifiers)).map(
                        (identifier) => identifier.partyId,
                    ),
                ).toEqual([firstParty!.id]);
                expect(await transaction.select().from(partyRoles)).toHaveLength(2);
            },
        );

        expect(await runtimeConnection.database.select().from(parties)).toEqual([]);
        expect(await runtimeConnection.database.select().from(partyIdentifiers)).toEqual([]);

        await expectDatabaseError(
            runtimeConnection.withTenantTransaction(
                { organizationId: fixture.firstOrganizationId, userId: fixture.firstUserId },
                async (transaction) => {
                    await transaction.execute(
                        sql`SELECT set_config('ardenfold.permission.parties.write', 'true', true)`,
                    );
                    await transaction
                        .insert(partyContacts)
                        .values(buildPartyContact(fixture.firstOrganizationId, secondParty!.id));
                },
            ),
            "23503",
            "party_contacts_party_fk",
        );
    });

    it("enforces party contact and address constraints and loses access after membership removal", async () => {
        const fixture = await seedTenantIsolationFixture(connection);
        const [party] = await connection.database
            .insert(parties)
            .values(buildParty(fixture.firstOrganizationId))
            .returning();
        const [contact] = await connection.database
            .insert(partyContacts)
            .values(buildPartyContact(fixture.firstOrganizationId, party!.id))
            .returning();

        await connection.database.insert(partyContactChannels).values({
            organizationId: fixture.firstOrganizationId,
            contactId: contact!.id,
            type: "email",
            value: "contact@example.test",
        });
        await expectDatabaseError(
            connection.database.insert(partyAddresses).values({
                organizationId: fixture.firstOrganizationId,
                partyId: party!.id,
                label: "Office",
                line1: "Main Street 1",
                locality: "Lima",
                countryCode: "pe",
            }),
            "23514",
            "party_addresses_country_code_format",
        );

        await connection.database
            .update(organizationMemberships)
            .set({
                status: "removed",
                removedAt: new Date(),
            })
            .where(eq(organizationMemberships.userId, fixture.firstUserId));

        await runtimeConnection.withTenantTransaction(
            { organizationId: fixture.firstOrganizationId, userId: fixture.firstUserId },
            async (transaction) => {
                await transaction.execute(
                    sql`SELECT set_config('ardenfold.permission.parties.read', 'true', true)`,
                );
                expect(await transaction.select().from(parties)).toEqual([]);
            },
        );

        const rls = await connection.database.execute<{
            relname: string;
            relrowsecurity: boolean;
            relforcerowsecurity: boolean;
        }>(sql`
            SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
            WHERE relname IN ('parties', 'party_roles', 'party_identifiers', 'party_contacts', 'party_contact_channels', 'party_addresses')
            ORDER BY relname
        `);
        expect(rls.rows).toHaveLength(6);
        expect(rls.rows.every((table) => table.relrowsecurity && table.relforcerowsecurity)).toBe(
            true,
        );
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
    constraint: string | undefined,
): Promise<void> {
    let received: unknown;

    try {
        await operation;
    } catch (error: unknown) {
        received = error;
    }

    expect(received).toBeInstanceOf(Error);
    expect((received as Error & { cause?: unknown }).cause).toMatchObject(
        constraint === undefined ? { code } : { code, constraint },
    );
}

async function provisionRuntimeLogin(connection: DatabaseConnection): Promise<void> {
    await connection.database.execute(sql`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ardenfold_test_runtime') THEN
                CREATE ROLE ardenfold_test_runtime
                    LOGIN
                    PASSWORD 'ardenfold_test_runtime_password'
                    NOSUPERUSER
                    NOCREATEDB
                    NOCREATEROLE
                    NOREPLICATION
                    NOBYPASSRLS;
            END IF;
        END
        $$
    `);
    await connection.database.execute(sql`
        ALTER ROLE ardenfold_test_runtime
            WITH LOGIN
            PASSWORD 'ardenfold_test_runtime_password'
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOREPLICATION
            NOBYPASSRLS
    `);
    await connection.database.execute(sql`
        GRANT ardenfold_runtime TO ardenfold_test_runtime
    `);
}

function createRuntimeConnectionUrl(connectionString: string): string {
    const url = new URL(connectionString);

    url.username = "ardenfold_test_runtime";
    url.password = "ardenfold_test_runtime_password";

    return url.toString();
}

async function seedTenantIsolationFixture(connection: DatabaseConnection): Promise<{
    firstOrganizationId: string;
    firstUserId: string;
    secondOrganizationId: string;
}> {
    const [firstOrganization, secondOrganization] = await connection.database
        .insert(organizations)
        .values([buildOrganization(), buildOrganization()])
        .returning();
    const [firstUser, secondUser] = await connection.database
        .insert(users)
        .values([buildUser(), buildUser()])
        .returning();

    await connection.database
        .insert(organizationMemberships)
        .values([
            buildOrganizationMembership(firstOrganization!.id, firstUser!.id),
            buildOrganizationMembership(secondOrganization!.id, secondUser!.id),
        ]);
    await connection.database
        .insert(organizationSites)
        .values([
            buildOrganizationSite(firstOrganization!.id, { name: "First tenant site" }),
            buildOrganizationSite(secondOrganization!.id, { name: "Second tenant site" }),
        ]);

    return {
        firstOrganizationId: firstOrganization!.id,
        firstUserId: firstUser!.id,
        secondOrganizationId: secondOrganization!.id,
    };
}
