import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3001/api/v1";

async function token(identity: string): Promise<string> {
    const response = await fetch(`http://127.0.0.1:4010/test/access-token?identity=${identity}`);
    expect(response.ok).toBe(true);
    return ((await response.json()) as { access_token: string }).access_token;
}

async function call(
    accessToken: string,
    path: string,
    method = "GET",
    organizationId?: string,
    body?: unknown,
) {
    const response = await fetch(`${api}${path}`, {
        method,
        headers: {
            authorization: `Bearer ${accessToken}`,
            ...(organizationId ? { "x-ardenfold-organization-id": organizationId } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test("review and approval bind one submitted revision and lose applicability after correction", async () => {
    const owner = await token("user_e2e_owner");
    const reviewer = await token("user_e2e_member");
    const me = await call(owner, "/auth/me");
    const ownerId = (me.body.user as { id: string }).id;
    const org = await call(owner, "/organizations", "POST", undefined, {
        name: "Technical decisions",
        defaultLocale: "en",
        defaultTimeZone: "UTC",
    });
    expect(org.status, JSON.stringify(org.body)).toBe(201);
    const orgId = org.body.id as string;
    const policy = await call(owner, "/technical-decision-policy", "GET", orgId);
    expect(policy.body).toMatchObject({
        requirePerformerReviewerSeparation: true,
        requireReviewerApproverSeparation: false,
    });
    const invitation = await call(owner, "/organizations/current/invitations", "POST", orgId, {
        email: "member@example.test",
        role: "member",
    });
    expect(invitation.status, JSON.stringify(invitation.body)).toBe(201);
    const joined = await call(reviewer, "/invitations/accept", "POST", undefined, {
        token: invitation.body.acceptanceToken,
    });
    expect(joined.status, JSON.stringify(joined.body)).toBe(201);
    const site = await call(owner, "/organizations/current/sites", "POST", orgId, {
        name: "Technical shop",
    });
    const customer = await call(owner, "/parties", "POST", orgId, {
        kind: "organization",
        displayName: "Decision customer",
        roles: ["customer"],
    });
    const asset = await call(owner, "/assets", "POST", orgId, { displayName: "Valve A" });
    const request = await call(owner, "/service-requests", "POST", orgId, {
        customerPartyId: customer.body.id,
        summary: "Inspect valve",
        scopeItems: [{ description: "Measure valve" }],
    });
    expect(request.status, JSON.stringify(request.body)).toBe(201);
    const quote = await call(owner, "/quotations", "POST", orgId, {
        requestId: request.body.id,
        reference: `Q-${randomUUID()}`,
        draft: {
            currencyCode: "PEN",
            paymentTerms: null,
            deliveryTerms: null,
            serviceLocation: null,
            intakeExpectations: null,
            exclusions: null,
            validUntil: null,
            adjustments: [],
            lines: [
                {
                    description: "Measure valve",
                    quantity: "1",
                    unit: "unit",
                    unitPrice: "10",
                    partyId: null,
                    assetId: asset.body.id,
                    adjustments: [],
                },
            ],
        },
    });
    expect(quote.status, JSON.stringify(quote.body)).toBe(201);
    const quoteRevision = (
        quote.body.revisions as Array<{ id: string; lines: Array<{ id: string }> }>
    )[0]!;
    const offered = await call(
        owner,
        `/quotations/${quote.body.id as string}/revisions/${quoteRevision.id}/issue`,
        "POST",
        orgId,
        { expectedVersion: quote.body.version, channel: "email" },
    );
    expect(offered.status, JSON.stringify(offered.body)).toBe(200);
    const acceptance = await call(
        owner,
        `/quotations/${quote.body.id as string}/acceptances`,
        "POST",
        orgId,
        {
            expectedVersion: offered.body.version,
            idempotencyKey: randomUUID(),
            revisionId: quoteRevision.id,
            agreementAt: null,
            suppliedByName: "Customer",
            suppliedByContactId: null,
            channel: "email",
            externalReference: null,
        },
    );
    expect(acceptance.status, JSON.stringify(acceptance.body)).toBe(200);
    const acceptedQuote = await call(owner, `/quotations/${quote.body.id as string}`, "GET", orgId);
    const order = await call(owner, "/work-orders", "POST", orgId, {
        quoteId: quote.body.id,
        acceptanceId: acceptance.body.id,
        acceptedRevisionId: quoteRevision.id,
        expectedQuoteVersion: acceptedQuote.body.version,
        expectedRequestVersion: request.body.version,
        siteId: site.body.id,
        reference: `WO-${randomUUID()}`,
        idempotencyKey: randomUUID(),
        items: [
            {
                sourceRevisionLineId: quoteRevision.lines[0]!.id,
                scopeDescription: "Measure valve",
                allocatedQuantity: "1",
                allocatedUnit: "unit",
                partyId: null,
                assetRequirement: "required",
                assetId: asset.body.id,
                unresolvedAssetDescription: null,
                serviceMode: "no_intake",
            },
        ],
    });
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    const item = (order.body.items as Array<{ id: string; version: number }>)[0]!;
    const readyItem = await call(
        owner,
        `/work-orders/${order.body.id as string}/items/${item.id}/ready`,
        "POST",
        orgId,
        {
            expectedOrderVersion: order.body.version,
            expectedItemVersion: item.version,
            reason: "Prepared",
        },
    );
    expect(readyItem.status, JSON.stringify(readyItem.body)).toBe(200);
    const readyOrder = await call(
        owner,
        `/work-orders/${order.body.id as string}/ready`,
        "POST",
        orgId,
        {
            expectedVersion: readyItem.body.version,
            reason: "Ready",
        },
    );
    expect(readyOrder.status, JSON.stringify(readyOrder.body)).toBe(200);
    const readyWorkItem = (readyOrder.body.items as Array<{ id: string; version: number }>)[0]!;
    const started = await call(owner, "/technical-executions", "POST", orgId, {
        workOrderId: order.body.id,
        workItemId: readyWorkItem.id,
        expectedOrderVersion: readyOrder.body.version,
        expectedItemVersion: readyWorkItem.version,
        idempotencyKey: randomUUID(),
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const execution = started.body.execution as { id: string; version: number };
    const revision = started.body.initialRevision as { id: string; version: number };
    const path = `/technical-executions/${execution.id}/revisions/${revision.id}`;
    const edited = await call(owner, path, "PATCH", orgId, {
        expectedVersion: revision.version,
        performerUserId: ownerId,
        methodName: "Visual measurement",
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const result = await call(owner, `${path}/results`, "POST", orgId, {
        expectedRevisionVersion: edited.body.version,
        value: {
            kind: "missing",
            groupId: null,
            position: 1,
            characteristic: "Valve gap",
            contextNote: null,
            missingReason: "not_observed",
            missingExplanation: "Gauge unavailable",
        },
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    const submitted = await call(owner, `${path}/submit`, "POST", orgId, {
        expectedVersion: (edited.body.version as number) + 1,
        idempotencyKey: randomUUID(),
    });
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    const beforeReview = await call(owner, `/technical-executions/${execution.id}`, "GET", orgId);
    const reviewCommand = {
        idempotencyKey: randomUUID(),
        expectedExecutionVersion: (beforeReview.body.execution as { version: number }).version,
        expectedRevisionVersion: submitted.body.version,
        outcome: "accepted",
        reason: null,
        notes: "Result assessed",
    };
    expect((await call(owner, `${path}/review`, "POST", orgId, reviewCommand)).status).toBe(403);
    const review = await call(reviewer, `${path}/review`, "POST", orgId, reviewCommand);
    expect(review.status, JSON.stringify(review.body)).toBe(201);
    const replayReview = await call(reviewer, `${path}/review`, "POST", orgId, reviewCommand);
    expect(replayReview.body.id).toBe(review.body.id);
    const beforeApproval = await call(owner, `/technical-executions/${execution.id}`, "GET", orgId);
    const approvalCommand = {
        idempotencyKey: randomUUID(),
        expectedExecutionVersion: (beforeApproval.body.execution as { version: number }).version,
        expectedRevisionVersion: submitted.body.version,
        reviewId: review.body.id,
        outcome: "approved",
        reason: null,
        notes: null,
    };
    const approval = await call(owner, `${path}/approval`, "POST", orgId, approvalCommand);
    expect(approval.status, JSON.stringify(approval.body)).toBe(201);
    const packagePath = `/technical-approvals/${approval.body.id as string}/package`;
    const approvedPackage = await call(owner, packagePath, "GET", orgId);
    expect(approvedPackage.status, JSON.stringify(approvedPackage.body)).toBe(200);
    expect(approvedPackage.body.applicable).toBe(true);
    expect((approvedPackage.body.results as Array<{ id: string }>)[0]?.id).toBe(result.body.id);
    const replayApproval = await call(owner, `${path}/approval`, "POST", orgId, approvalCommand);
    expect(replayApproval.body.id).toBe(approval.body.id);
    const beforeSuccessor = await call(
        owner,
        `/technical-executions/${execution.id}`,
        "GET",
        orgId,
    );
    const successor = await call(
        owner,
        `/technical-executions/${execution.id}/revisions`,
        "POST",
        orgId,
        {
            expectedExecutionVersion: (beforeSuccessor.body.execution as { version: number })
                .version,
            predecessorRevisionId: revision.id,
            reason: "Correct measurement",
            idempotencyKey: randomUUID(),
        },
    );
    expect(successor.status, JSON.stringify(successor.body)).toBe(201);
    const historicalPackage = await call(owner, packagePath, "GET", orgId);
    expect(historicalPackage.body.applicable).toBe(false);
    const frozenResult = await call(
        owner,
        `${path}/results/${result.body.id as string}`,
        "PATCH",
        orgId,
        {
            expectedRevisionVersion: submitted.body.version,
            expectedResultVersion: result.body.version,
            value: {
                kind: "missing",
                groupId: null,
                position: 1,
                characteristic: "Valve gap",
                contextNote: null,
                missingReason: "unavailable",
                missingExplanation: null,
            },
        },
    );
    expect(frozenResult.status).toBe(409);
    const successorPath = `/technical-executions/${execution.id}/revisions/${successor.body.id as string}`;
    const correctionResult = await call(owner, `${successorPath}/results`, "POST", orgId, {
        expectedRevisionVersion: successor.body.version,
        value: {
            kind: "missing",
            groupId: null,
            position: 1,
            characteristic: "Valve gap",
            contextNote: null,
            missingReason: "not_observed",
            missingExplanation: "Repeat needed",
        },
    });
    expect(correctionResult.status, JSON.stringify(correctionResult.body)).toBe(201);
    const correctedSubmission = await call(owner, `${successorPath}/submit`, "POST", orgId, {
        expectedVersion: (successor.body.version as number) + 1,
        idempotencyKey: randomUUID(),
    });
    expect(correctedSubmission.status, JSON.stringify(correctedSubmission.body)).toBe(200);
    const currentExecution = await call(
        owner,
        `/technical-executions/${execution.id}`,
        "GET",
        orgId,
    );
    const requested = await call(reviewer, `${successorPath}/review`, "POST", orgId, {
        idempotencyKey: randomUUID(),
        expectedExecutionVersion: (currentExecution.body.execution as { version: number }).version,
        expectedRevisionVersion: correctedSubmission.body.version,
        outcome: "changes_requested",
        reason: "Repeat the measurement",
        notes: null,
    });
    expect(requested.status, JSON.stringify(requested.body)).toBe(201);
    expect(requested.body.outcome).toBe("changes_requested");
});
