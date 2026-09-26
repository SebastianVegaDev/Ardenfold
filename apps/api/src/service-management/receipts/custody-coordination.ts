import type {
    ReceiptCoordination,
    ReceiptCoordinationState,
    StartAssetRelationshipRequest,
} from "@ardenfold/contracts";
import type { ArdenfoldTransaction } from "@ardenfold/database";
import { Injectable } from "@nestjs/common";

import { AssetRelationshipsService } from "../../assets/relationships/asset-relationships.service";
import type { AuthenticatedPrincipal } from "../../auth/authentication/types";
import { ContractException } from "../../http/contracts";

@Injectable()
export class CustodyCoordination {
    constructor(private readonly relationships: AssetRelationshipsService) {}

    async apply(
        tx: ArdenfoldTransaction,
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        expectedAssetVersion: number,
        receivedAt: string,
        requested: ReceiptCoordination,
        receiptId: string,
        previous?: ReceiptCoordinationState,
        reason?: string,
        forceCorrection = false,
    ): Promise<ReceiptCoordinationState> {
        const current = await this.relationships.currentInTransaction(tx, organizationId, assetId);
        if (current.assetVersion !== expectedAssetVersion)
            throw new ContractException("VERSION_CONFLICT", 409);
        let assetVersion = expectedAssetVersion;
        const state: ReceiptCoordinationState = {
            custody: requested.custody,
            location: requested.location,
            custodyRelationshipId: previous?.custodyRelationshipId ?? null,
            locationRelationshipId: previous?.locationRelationshipId ?? null,
        };
        for (const kind of ["custody", "location"] as const) {
            const target = requested[kind];
            const old = previous?.[kind];
            if (!target) {
                if (old) {
                    if (current[kind]?.id !== previous?.[`${kind}RelationshipId`])
                        throw new ContractException("RELATIONSHIP_INTERVAL_CONFLICT", 409);
                    const result = await this.relationships.endInTransaction(
                        tx,
                        principal,
                        organizationId,
                        assetId,
                        {
                            kind,
                            expectedVersion: assetVersion,
                            effectiveAt: new Date().toISOString(),
                        },
                        receiptId,
                    );
                    assetVersion = result.assetVersion;
                    state[`${kind}RelationshipId`] = null;
                }
                continue;
            }
            if (old && JSON.stringify(old) === JSON.stringify(target) && !forceCorrection) continue;
            if (old && current[kind]?.id !== previous?.[`${kind}RelationshipId`])
                throw new ContractException("RELATIONSHIP_INTERVAL_CONFLICT", 409);
            const command = {
                kind,
                ...target,
                expectedVersion: assetVersion,
                effectiveAt: receivedAt,
            } satisfies StartAssetRelationshipRequest;
            const result = old
                ? await this.relationships.correctInTransaction(
                      tx,
                      principal,
                      organizationId,
                      assetId,
                      {
                          ...command,
                          reason: reason ?? "Correct receipt coordination",
                      },
                      receiptId,
                  )
                : await this.relationships.startInTransaction(
                      tx,
                      principal,
                      organizationId,
                      assetId,
                      command,
                      receiptId,
                  );
            assetVersion = result.assetVersion;
            state[`${kind}RelationshipId`] = result[kind]?.id ?? null;
        }
        return state;
    }

    async release(
        tx: ArdenfoldTransaction,
        principal: AuthenticatedPrincipal,
        organizationId: string,
        assetId: string,
        expectedAssetVersion: number,
        state: ReceiptCoordinationState,
        receiptId: string,
    ): Promise<void> {
        const current = await this.relationships.currentInTransaction(tx, organizationId, assetId);
        if (current.assetVersion !== expectedAssetVersion)
            throw new ContractException("VERSION_CONFLICT", 409);
        let assetVersion = expectedAssetVersion;
        for (const kind of ["custody", "location"] as const) {
            if (!state[kind]) continue;
            if (
                !state[`${kind}RelationshipId`] ||
                current[kind]?.id !== state[`${kind}RelationshipId`]
            )
                throw new ContractException("RELATIONSHIP_INTERVAL_CONFLICT", 409);
            const result = await this.relationships.endInTransaction(
                tx,
                principal,
                organizationId,
                assetId,
                { kind, expectedVersion: assetVersion, effectiveAt: new Date().toISOString() },
                receiptId,
            );
            assetVersion = result.assetVersion;
        }
    }
}
