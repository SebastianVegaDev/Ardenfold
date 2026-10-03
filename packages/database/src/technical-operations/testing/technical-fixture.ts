import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { ArdenfoldDatabase } from "../../index";
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
    serviceRequests,
    systemOrganizationRoleIds,
    users,
    workItems,
    workOrders,
} from "../../schema";

export async function technicalFixture(database: ArdenfoldDatabase) {
    const [org, otherOrg] = await database
        .insert(organizations)
        .values([{ name: "Technical tenant" }, { name: "Other technical tenant" }])
        .returning();
    const [actor, otherActor] = await database
        .insert(users)
        .values([
            { primaryEmail: "technical@example.test" },
            { primaryEmail: "other-technical@example.test" },
        ])
        .returning();
    await database.insert(organizationMemberships).values([
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
    const [site, otherSite] = await database
        .insert(organizationSites)
        .values([
            { organizationId: org!.id, name: "Main site" },
            { organizationId: otherOrg!.id, name: "Other site" },
        ])
        .returning();
    const [customer] = await database
        .insert(parties)
        .values({ organizationId: org!.id, kind: "organization", displayName: "Customer" })
        .returning();
    await database
        .insert(partyRoles)
        .values({ organizationId: org!.id, partyId: customer!.id, role: "customer" });
    const [asset, otherAsset] = await database
        .insert(assets)
        .values([
            { organizationId: org!.id, displayName: "Pump" },
            { organizationId: otherOrg!.id, displayName: "Foreign pump" },
        ])
        .returning();
    const [request] = await database
        .insert(serviceRequests)
        .values({
            organizationId: org!.id,
            customerPartyId: customer!.id,
            summary: "Inspect pump",
            createdByUserId: actor!.id,
            updatedByUserId: actor!.id,
        })
        .returning();
    const [quote] = await database
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
    const [commercialRevision] = await database.transaction(async (tx) => {
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
    const [line] = await database
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
    await database
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
    const [acceptance] = await database
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
    await database
        .update(quoteRevisions)
        .set({ status: "accepted", version: 3 })
        .where(eq(quoteRevisions.id, commercialRevision!.id));
    await database
        .update(quotes)
        .set({ status: "accepted", version: 3 })
        .where(eq(quotes.id, quote!.id));
    const [order] = await database
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
    const [item] = await database
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
    const [readyItem] = await database
        .update(workItems)
        .set({ status: "ready", version: 2 })
        .where(eq(workItems.id, item!.id))
        .returning();
    const [readyOrder] = await database
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

export function executionValues(f: Awaited<ReturnType<typeof technicalFixture>>) {
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
