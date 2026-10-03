import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "../../index";
import {
    executionRevisions,
    organizationMemberships,
    organizations,
    storedObjects,
    technicalApprovals,
    technicalEvidence,
    technicalEvidenceHistoryEntries,
    technicalExecutions,
    technicalResultGroups,
    technicalResults,
    technicalReviews,
    users,
} from "../../schema";
import { executionValues, technicalFixture } from "../testing/technical-fixture";

function connection(url: string): DatabaseConnection {
    return createDatabaseConnection({
        connectionString: url,
        max: 5,
        idleTimeoutMillis: 1_000,
        connectionTimeoutMillis: 5_000,
        ssl: false,
        applicationName: "technical-content-persistence-test",
    });
}

describe("technical content and decision persistence", () => {
    let migrator: DatabaseConnection;
    let runtime: DatabaseConnection;
    let container: StartedPostgreSqlContainer | undefined;

    beforeAll(async () => {
        let url = process.env.DATABASE_TEST_URL;
        if (!url) {
            container = await new PostgreSqlContainer("postgres:18.6-bookworm")
                .withDatabase("ardenfold_technical_content_test")
                .withUsername("ardenfold_migrator")
                .withPassword("ardenfold_migrator_password")
                .start();
            url = container.getConnectionUri();
        }
        migrator = connection(url);
        await migrate(migrator.database, { migrationsFolder: resolve(process.cwd(), "drizzle") });
        await migrator.database.execute(
            sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ardenfold_content_runtime') THEN CREATE ROLE ardenfold_content_runtime LOGIN PASSWORD 'ardenfold_content_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$`,
        );
        await migrator.database.execute(sql`GRANT ardenfold_runtime TO ardenfold_content_runtime`);
        const runtimeUrl = new URL(url);
        runtimeUrl.username = "ardenfold_content_runtime";
        runtimeUrl.password = "ardenfold_content_password";
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

    async function draft() {
        const f = await technicalFixture(migrator.database);
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
                    performerUserId: f.actor.id,
                    performerNameSnapshot: "Technician",
                    methodName: "Inspection method",
                    createdByUserId: f.actor.id,
                    updatedByUserId: f.actor.id,
                })
                .returning();
        });
        const [membership] = await migrator.database
            .select()
            .from(organizationMemberships)
            .where(eq(organizationMemberships.userId, f.actor.id));
        return { ...f, execution: execution!, revision: revision!, membership: membership! };
    }

    async function submit(revisionId: string, actorId: string) {
        await migrator.database
            .update(executionRevisions)
            .set({
                status: "submitted",
                version: 2,
                submittedAt: new Date(),
                submittedByUserId: actorId,
                requirePerformerReviewerSeparation: true,
                requireReviewerApproverSeparation: false,
            })
            .where(eq(executionRevisions.id, revisionId));
    }

    it("round-trips exact decimal spelling and distinguishes all four result forms", async () => {
        const f = await draft();
        const basis = {
            organizationId: f.org.id,
            executionId: f.execution.id,
            revisionId: f.revision.id,
            createdByUserId: f.actor.id,
            updatedByUserId: f.actor.id,
        };
        const [group] = await migrator.database
            .insert(technicalResultGroups)
            .values({ ...basis, position: 1, label: "Pressure readings" })
            .returning();
        const [quantitative] = await migrator.database
            .insert(technicalResults)
            .values({
                ...basis,
                groupId: group!.id,
                position: 1,
                characteristic: "Pressure",
                kind: "quantitative",
                decimalValueText: "000001.2300",
                unitCode: "kPa",
                resolutionText: "0.0001",
                uncertaintyText: "0.0100",
                uncertaintyUnitCode: "kPa",
                uncertaintyCoverage: "k=2",
                significantDigits: 6,
                toleranceLowerText: "1.0000",
                toleranceUpperText: "2.0000",
                toleranceUnitCode: "kPa",
                toleranceRule: "Procedure P-1",
                conformity: "conforms",
                conformityRule: "Procedure P-1",
            })
            .returning();
        expect(quantitative?.decimalValueText).toBe("000001.2300");
        expect(quantitative?.uncertaintyText).toBe("0.0100");
        await migrator.database.insert(technicalResults).values({
            ...basis,
            position: 1,
            characteristic: "Visual class",
            kind: "categorical",
            categoryCode: "clear",
            categoryLabel: "Clear",
            categoryMeaningSnapshot: "No visible damage",
        });
        await migrator.database.insert(technicalResults).values({
            ...basis,
            position: 2,
            characteristic: "Observation",
            kind: "textual",
            textValue: "No vibration observed",
            textLanguage: "en",
        });
        const [missing] = await migrator.database
            .insert(technicalResults)
            .values({
                ...basis,
                position: 3,
                characteristic: "Flow",
                kind: "missing",
                missingReason: "not_observed",
                missingExplanation: "No flow sensor installed",
            })
            .returning();
        expect(missing?.decimalValueText).toBeNull();
        await expect(
            migrator.database.insert(technicalResults).values({
                ...basis,
                position: 4,
                characteristic: "Malformed",
                kind: "quantitative",
                decimalValueText: "1e-5",
                unitCode: "1",
            }),
        ).rejects.toThrow();
        await expect(
            migrator.database.insert(technicalResults).values({
                ...basis,
                position: 4,
                characteristic: "Contradictory",
                kind: "missing",
                missingReason: "unavailable",
                decimalValueText: "0",
                unitCode: "1",
            }),
        ).rejects.toThrow();
        await expect(
            migrator.database.insert(technicalResults).values({
                ...basis,
                position: 1,
                characteristic: "Duplicate",
                kind: "textual",
                textValue: "duplicate",
            }),
        ).rejects.toThrow();
        await expect(
            migrator.database.insert(technicalResults).values({
                ...basis,
                groupId: group!.id,
                position: 2,
                characteristic: "Invalid resolution",
                kind: "quantitative",
                decimalValueText: "1.00",
                unitCode: "1",
                resolutionText: "0",
            }),
        ).rejects.toThrow();
        await expect(
            migrator.database.insert(technicalResults).values({
                ...basis,
                position: 4,
                characteristic: "Invalid unit",
                kind: "quantitative",
                decimalValueText: "1.00",
                unitCode: "bad unit",
            }),
        ).rejects.toThrow();
        await expect(
            migrator.database.insert(technicalResults).values({
                ...basis,
                position: 4,
                characteristic: "Reversed tolerance",
                kind: "quantitative",
                decimalValueText: "1.00",
                unitCode: "1",
                toleranceLowerText: "2.00",
                toleranceUpperText: "1.00",
                toleranceUnitCode: "1",
                toleranceRule: "Procedure P-1",
            }),
        ).rejects.toThrow();
        await expect(
            migrator.database.insert(technicalResults).values({
                ...basis,
                position: 4,
                characteristic: "Blank note",
                kind: "textual",
                textValue: "   ",
            }),
        ).rejects.toThrow();
        await submit(f.revision.id, f.actor.id);
        await expect(
            migrator.database
                .update(technicalResults)
                .set({ decimalValueText: "2.00", version: 2 })
                .where(eq(technicalResults.id, quantitative!.id)),
        ).rejects.toThrow();
        await expect(
            migrator.database
                .delete(technicalResultGroups)
                .where(eq(technicalResultGroups.id, group!.id)),
        ).rejects.toThrow();
    });

    it("accepts only retained same-tenant files and preserves evidence changes", async () => {
        const f = await draft();
        const basis = {
            organizationId: f.org.id,
            executionId: f.execution.id,
            revisionId: f.revision.id,
            attributedMembershipId: f.membership.id,
            attributedByUserId: f.actor.id,
            updatedByUserId: f.actor.id,
            target: "revision" as const,
            kind: "file" as const,
            evidenceType: "report",
            description: "Inspection report",
        };
        const [object] = await migrator.database
            .insert(storedObjects)
            .values({
                organizationId: f.org.id,
                storageKey: `${f.org.id}/${randomUUID()}`,
                originalFilename: "report.pdf",
                declaredMediaType: "application/pdf",
                expectedByteLength: 5,
                expectedSha256: "a".repeat(64),
                idempotencyKey: randomUUID(),
                requestHash: "b".repeat(64),
                uploadedByUserId: f.actor.id,
            })
            .returning();
        await expect(
            migrator.database
                .insert(technicalEvidence)
                .values({ ...basis, storedObjectId: object!.id }),
        ).rejects.toThrow();
        await migrator.database
            .update(storedObjects)
            .set({
                status: "uploaded",
                byteLength: 5,
                sha256: "a".repeat(64),
                mediaType: "application/pdf",
                uploadedAt: new Date(),
            })
            .where(eq(storedObjects.id, object!.id));
        await migrator.database
            .update(storedObjects)
            .set({ status: "finalized", finalizedAt: new Date() })
            .where(eq(storedObjects.id, object!.id));
        await expect(
            migrator.database
                .insert(technicalEvidence)
                .values({ ...basis, storedObjectId: object!.id }),
        ).rejects.toThrow();
        await migrator.database
            .update(storedObjects)
            .set({ retainedAt: new Date() })
            .where(eq(storedObjects.id, object!.id));
        const [evidence] = await runtime.withTenantTransaction(
            { organizationId: f.org.id, userId: f.actor.id },
            async (tx) => {
                await tx.execute(
                    sql`SELECT set_config('ardenfold.permission.technical_executions.write', 'true', true), set_config('ardenfold.permission.technical_evidence.read', 'true', true), set_config('ardenfold.permission.files.read', 'true', true), set_config('ardenfold.permission.files.upload', 'true', true)`,
                );
                return tx
                    .insert(technicalEvidence)
                    .values({ ...basis, storedObjectId: object!.id })
                    .returning();
            },
        );
        const withoutEvidenceRead = await runtime.withTenantTransaction(
            { organizationId: f.org.id, userId: f.actor.id },
            async (tx) => {
                await tx.execute(
                    sql`SELECT set_config('ardenfold.permission.technical_executions.write', 'true', true)`,
                );
                return tx
                    .select()
                    .from(technicalEvidence)
                    .where(eq(technicalEvidence.id, evidence!.id));
            },
        );
        expect(withoutEvidenceRead).toEqual([]);
        await migrator.database
            .update(technicalEvidence)
            .set({ description: "Corrected report description", version: 2 })
            .where(eq(technicalEvidence.id, evidence!.id));
        const history = await migrator.database
            .select()
            .from(technicalEvidenceHistoryEntries)
            .where(eq(technicalEvidenceHistoryEntries.evidenceId, evidence!.id));
        expect(history.map((row) => row.evidenceVersion).sort()).toEqual([1, 2]);
        await expect(
            migrator.database
                .delete(technicalEvidenceHistoryEntries)
                .where(eq(technicalEvidenceHistoryEntries.evidenceId, evidence!.id)),
        ).rejects.toThrow();
        await expect(
            migrator.database
                .insert(technicalEvidence)
                .values({ ...basis, storedObjectId: object!.id, organizationId: f.otherOrg.id }),
        ).rejects.toThrow();
        await submit(f.revision.id, f.actor.id);
        await expect(
            migrator.database
                .update(technicalEvidence)
                .set({ description: "Rewritten", version: 3 })
                .where(eq(technicalEvidence.id, evidence!.id)),
        ).rejects.toThrow();
        await expect(
            migrator.database
                .delete(technicalEvidence)
                .where(eq(technicalEvidence.id, evidence!.id)),
        ).rejects.toThrow();
    });

    it("pins review and approval to an immutable submitted revision", async () => {
        const f = await draft();
        const reviewBasis = {
            organizationId: f.org.id,
            executionId: f.execution.id,
            revisionId: f.revision.id,
            reviewerMembershipId: f.membership.id,
            reviewerUserId: f.actor.id,
            reviewerNameSnapshot: "Reviewer",
            policyVersion: "m5-v1",
            idempotencyKey: randomUUID(),
            payloadHash: "c".repeat(64),
        };
        await expect(
            migrator.database
                .insert(technicalReviews)
                .values({ ...reviewBasis, outcome: "accepted" }),
        ).rejects.toThrow();
        await submit(f.revision.id, f.actor.id);
        const [review] = await migrator.database
            .insert(technicalReviews)
            .values({ ...reviewBasis, outcome: "accepted" })
            .returning();
        await expect(
            migrator.database.insert(technicalReviews).values({
                ...reviewBasis,
                idempotencyKey: randomUUID(),
                outcome: "rejected",
                reason: "Not acceptable",
            }),
        ).rejects.toThrow();
        const approvalBasis = {
            organizationId: f.org.id,
            executionId: f.execution.id,
            revisionId: f.revision.id,
            reviewId: review!.id,
            approverMembershipId: f.membership.id,
            approverUserId: f.actor.id,
            approverNameSnapshot: "Approver",
            policyVersion: "m5-v1",
            idempotencyKey: randomUUID(),
            payloadHash: "d".repeat(64),
        };
        const [approval] = await migrator.database
            .insert(technicalApprovals)
            .values({ ...approvalBasis, outcome: "approved" })
            .returning();
        await expect(
            migrator.database
                .update(technicalReviews)
                .set({ notes: "Rewritten" })
                .where(eq(technicalReviews.id, review!.id)),
        ).rejects.toThrow();
        await expect(
            migrator.database
                .delete(technicalApprovals)
                .where(eq(technicalApprovals.id, approval!.id)),
        ).rejects.toThrow();
        const [successor] = await migrator.database.transaction(async (tx) => {
            await tx
                .update(technicalExecutions)
                .set({ version: 3, nextRevisionNumber: 3 })
                .where(eq(technicalExecutions.id, f.execution.id));
            return tx
                .insert(executionRevisions)
                .values({
                    organizationId: f.org.id,
                    executionId: f.execution.id,
                    revisionNumber: 2,
                    predecessorRevisionId: f.revision.id,
                    correctionReason: "Correct approved work",
                    performerUserId: f.actor.id,
                    performerNameSnapshot: "Technician",
                    methodName: "Inspection method",
                    createdByUserId: f.actor.id,
                    updatedByUserId: f.actor.id,
                })
                .returning();
        });
        expect(successor?.status).toBe("draft");
        expect(
            (
                await migrator.database
                    .select()
                    .from(technicalApprovals)
                    .where(eq(technicalApprovals.id, approval!.id))
            )[0]?.revisionId,
        ).toBe(f.revision.id);
        const rows = await runtime.withTenantTransaction(
            { organizationId: f.otherOrg.id, userId: f.otherActor.id },
            async (tx) => {
                await tx.execute(
                    sql`SELECT set_config('ardenfold.permission.technical_executions.read', 'true', true)`,
                );
                return tx.select().from(technicalApprovals);
            },
        );
        expect(rows).toEqual([]);
        const noContext = await runtime.database.select().from(technicalReviews);
        expect(noContext).toEqual([]);
        await migrator.database
            .update(organizationMemberships)
            .set({ status: "suspended", suspendedAt: new Date() })
            .where(eq(organizationMemberships.userId, f.actor.id));
        const afterSuspension = await runtime.withTenantTransaction(
            { organizationId: f.org.id, userId: f.actor.id },
            async (tx) => {
                await tx.execute(
                    sql`SELECT set_config('ardenfold.permission.technical_executions.read', 'true', true)`,
                );
                return tx
                    .select()
                    .from(technicalApprovals)
                    .where(eq(technicalApprovals.id, approval!.id));
            },
        );
        expect(afterSuspension).toEqual([]);
        const forced = await migrator.database.execute(
            sql`SELECT relname, relforcerowsecurity FROM pg_class WHERE relname IN ('technical_result_groups','technical_results','technical_evidence','technical_evidence_history_entries','technical_reviews','technical_approvals')`,
        );
        expect(forced.rows).toHaveLength(6);
        expect(forced.rows.every((row) => row.relforcerowsecurity === true)).toBe(true);
    });

    it("keeps changes-requested history and decision evidence on exact targets", async () => {
        const f = await draft();
        const [result] = await migrator.database
            .insert(technicalResults)
            .values({
                organizationId: f.org.id,
                executionId: f.execution.id,
                revisionId: f.revision.id,
                position: 1,
                characteristic: "Visual condition",
                kind: "categorical",
                categoryCode: "clear",
                categoryLabel: "Clear",
                categoryMeaningSnapshot: "No visible damage",
                createdByUserId: f.actor.id,
                updatedByUserId: f.actor.id,
            })
            .returning();
        const evidenceBasis = {
            organizationId: f.org.id,
            executionId: f.execution.id,
            revisionId: f.revision.id,
            attributedMembershipId: f.membership.id,
            attributedByUserId: f.actor.id,
            updatedByUserId: f.actor.id,
            kind: "observation" as const,
            evidenceType: "note",
            description: "Supporting observation",
            observationText: "Observed at site",
        };
        const [sourceEvidence] = await migrator.database
            .insert(technicalEvidence)
            .values({ ...evidenceBasis, target: "result", resultId: result!.id })
            .returning();
        await submit(f.revision.id, f.actor.id);
        const [review] = await migrator.database
            .insert(technicalReviews)
            .values({
                organizationId: f.org.id,
                executionId: f.execution.id,
                revisionId: f.revision.id,
                outcome: "changes_requested",
                reason: "Retest the measurement",
                reviewerMembershipId: f.membership.id,
                reviewerUserId: f.actor.id,
                reviewerNameSnapshot: "Reviewer",
                policyVersion: "m5-v1",
                idempotencyKey: randomUUID(),
                payloadHash: "a".repeat(64),
            })
            .returning();
        await expect(
            migrator.database
                .update(technicalEvidence)
                .set({ target: "review", resultId: null, reviewId: review!.id, version: 2 })
                .where(eq(technicalEvidence.id, sourceEvidence!.id)),
        ).rejects.toThrow();
        await expect(
            migrator.database.insert(technicalApprovals).values({
                organizationId: f.org.id,
                executionId: f.execution.id,
                revisionId: f.revision.id,
                reviewId: review!.id,
                outcome: "approved",
                approverMembershipId: f.membership.id,
                approverUserId: f.actor.id,
                approverNameSnapshot: "Approver",
                policyVersion: "m5-v1",
                idempotencyKey: randomUUID(),
                payloadHash: "b".repeat(64),
            }),
        ).rejects.toThrow();
        const [decisionEvidence] = await migrator.database
            .insert(technicalEvidence)
            .values({ ...evidenceBasis, target: "review", reviewId: review!.id })
            .returning();
        await expect(
            migrator.database
                .update(technicalEvidence)
                .set({ description: "Late edit", version: 2 })
                .where(eq(technicalEvidence.id, decisionEvidence!.id)),
        ).rejects.toThrow();
        const [successor] = await migrator.database.transaction(async (tx) => {
            await tx
                .update(technicalExecutions)
                .set({ version: 3, nextRevisionNumber: 3 })
                .where(eq(technicalExecutions.id, f.execution.id));
            return tx
                .insert(executionRevisions)
                .values({
                    organizationId: f.org.id,
                    executionId: f.execution.id,
                    revisionNumber: 2,
                    predecessorRevisionId: f.revision.id,
                    correctionReason: "Retested after review",
                    performerUserId: f.actor.id,
                    performerNameSnapshot: "Technician",
                    methodName: "Inspection method",
                    createdByUserId: f.actor.id,
                    updatedByUserId: f.actor.id,
                })
                .returning();
        });
        await expect(
            migrator.database.insert(technicalEvidence).values({
                ...evidenceBasis,
                revisionId: successor!.id,
                target: "result",
                resultId: result!.id,
            }),
        ).rejects.toThrow();
        const [successorEvidence] = await migrator.database
            .insert(technicalEvidence)
            .values({
                ...evidenceBasis,
                revisionId: successor!.id,
                target: "revision",
                sourceEvidenceId: sourceEvidence!.id,
                correctionReason: "Rechecked after review",
            })
            .returning();
        await expect(
            migrator.database.insert(technicalEvidence).values({
                ...evidenceBasis,
                revisionId: successor!.id,
                target: "revision",
                sourceEvidenceId: successorEvidence!.id,
                correctionReason: "Invalid same-revision correction",
            }),
        ).rejects.toThrow();
        await submit(successor!.id, f.actor.id);
        const [secondReview] = await migrator.database
            .insert(technicalReviews)
            .values({
                organizationId: f.org.id,
                executionId: f.execution.id,
                revisionId: successor!.id,
                outcome: "accepted",
                reviewerMembershipId: f.membership.id,
                reviewerUserId: f.actor.id,
                reviewerNameSnapshot: "Reviewer",
                policyVersion: "m5-v1",
                idempotencyKey: randomUUID(),
                payloadHash: "c".repeat(64),
            })
            .returning();
        const [approval] = await migrator.database
            .insert(technicalApprovals)
            .values({
                organizationId: f.org.id,
                executionId: f.execution.id,
                revisionId: successor!.id,
                reviewId: secondReview!.id,
                outcome: "approved",
                approverMembershipId: f.membership.id,
                approverUserId: f.actor.id,
                approverNameSnapshot: "Approver",
                policyVersion: "m5-v1",
                idempotencyKey: randomUUID(),
                payloadHash: "d".repeat(64),
            })
            .returning();
        await migrator.database.insert(technicalEvidence).values({
            ...evidenceBasis,
            revisionId: successor!.id,
            target: "approval",
            approvalId: approval!.id,
        });
        expect(
            (
                await migrator.database
                    .select()
                    .from(technicalReviews)
                    .where(eq(technicalReviews.id, review!.id))
            )[0]?.outcome,
        ).toBe("changes_requested");
        expect(
            (
                await migrator.database
                    .select()
                    .from(technicalApprovals)
                    .where(eq(technicalApprovals.id, approval!.id))
            )[0]?.revisionId,
        ).toBe(successor!.id);
    });
});
