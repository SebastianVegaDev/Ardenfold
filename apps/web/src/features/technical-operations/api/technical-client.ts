import { technicalQueueResponseSchema, type TechnicalQueueResponse } from "@ardenfold/contracts";

export class TechnicalWebError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
    ) {
        super(code);
    }
}

export type Execution = {
    id: string;
    workOrderId: string;
    workItemId: string;
    version: number;
    status: "active" | "abandoned";
    attemptNumber: number;
    scopeDescriptionAtStart: string;
    siteIdAtStart: string;
    siteNameAtStart: string;
    targetAssetLabelAtStart: string | null;
};

export type Revision = {
    id: string;
    revisionNumber: number;
    status: "draft" | "submitted" | "discarded";
    version: number;
    predecessorRevisionId: string | null;
    performerUserId: string | null;
    performerNameSnapshot: string | null;
    methodName: string | null;
    methodIdentifier: string | null;
    methodVersion: string | null;
    performedStartedAt: string | null;
    performedEndedAt: string | null;
    performedAtSiteId: string | null;
    performedLocationSnapshot: string | null;
    technicianNotes: string | null;
    correctionReason: string | null;
    submittedAt: string | null;
};

export type Condition = {
    revisionId: string;
    position: number;
    name: string;
    decimalValue: string | null;
    unitCode: string | null;
    textValue: string | null;
    observedAt: string | null;
};

export type SupportingAsset = {
    revisionId: string;
    assetId: string;
    position: number;
    use: string;
};

export type ExecutionDetail = {
    execution: Execution;
    revisions: Revision[];
    conditions: Condition[];
    supportingAssets: SupportingAsset[];
    history: {
        executionVersion: number;
        revisionId: string | null;
        kind: string;
        snapshot: Record<string, unknown>;
        recordedAt: string;
    }[];
};

export type ResultRow = {
    id: string;
    version: number;
    groupId: string | null;
    position: number;
    characteristic: string;
    contextNote: string | null;
    kind: "quantitative" | "categorical" | "textual" | "missing";
    decimalValueText: string | null;
    unitCode: string | null;
    resolutionText: string | null;
    significantDigits: number | null;
    uncertaintyText: string | null;
    uncertaintyUnitCode: string | null;
    uncertaintyCoverage: string | null;
    toleranceLowerText: string | null;
    toleranceUpperText: string | null;
    toleranceUnitCode: string | null;
    toleranceRule: string | null;
    categoryCode: string | null;
    categoryLabel: string | null;
    categoryMeaningSnapshot: string | null;
    textValue: string | null;
    textLanguage: string | null;
    missingReason: "not_observed" | "not_applicable" | "unavailable" | null;
    missingExplanation: string | null;
    conformity: "conforms" | "does_not_conform" | "undetermined" | null;
    conformityRule: string | null;
};

export type GroupRow = { id: string; version: number; position: number; label: string };
export type ResultsDetail = { groups: GroupRow[]; results: ResultRow[] };
export type EvidenceRow = {
    id: string;
    version: number;
    target: "revision" | "result";
    resultId: string | null;
    kind: "file" | "observation";
    evidenceType: string;
    description: string;
    observationText: string | null;
    removedAt: string | null;
};

export async function technicalRequest<T>(
    path: string,
    options: { method?: "GET" | "POST" | "PATCH" | "PUT"; body?: unknown; binary?: Blob } = {},
): Promise<T> {
    const response = await fetch(`/auth/technical/${path}`, {
        method: options.method ?? "GET",
        ...(options.binary || options.body
            ? {
                  headers: {
                      "content-type": options.binary
                          ? "application/octet-stream"
                          : "application/json",
                  },
              }
            : {}),
        ...(options.binary || options.body
            ? { body: options.binary ?? JSON.stringify(options.body) }
            : {}),
        cache: "no-store",
    });
    if (!response.ok) {
        const value: unknown = await response.json().catch(() => null);
        const code =
            value &&
            typeof value === "object" &&
            "error" in value &&
            value.error &&
            typeof value.error === "object" &&
            "code" in value.error &&
            typeof value.error.code === "string"
                ? value.error.code
                : "TECHNICAL_REQUEST_FAILED";
        throw new TechnicalWebError(response.status, code);
    }
    return (await response.json()) as T;
}

export async function fetchQueue(kind: string, cursor?: string): Promise<TechnicalQueueResponse> {
    const params = new URLSearchParams({ kind, limit: "25" });
    if (cursor) params.set("cursor", cursor);
    return technicalQueueResponseSchema.parse(
        await technicalRequest(`technical-operations/queues?${params}`),
    );
}

export async function fetchExecution(id: string): Promise<ExecutionDetail> {
    return technicalRequest<ExecutionDetail>(`technical-executions/${encodeURIComponent(id)}`);
}

export async function fetchResults(
    executionId: string,
    revisionId: string,
): Promise<ResultsDetail> {
    return technicalRequest<ResultsDetail>(
        `technical-executions/${executionId}/revisions/${revisionId}/results`,
    );
}

export async function fetchEvidence(
    executionId: string,
    revisionId: string,
): Promise<EvidenceRow[]> {
    const response = await technicalRequest<{ data: EvidenceRow[] }>(
        `technical-executions/${executionId}/revisions/${revisionId}/evidence`,
    );
    return response.data;
}
