"use client";

import {
    createTechnicalEvidenceSchema,
    requestFileUploadSchema,
    storedObjectSchema,
} from "@ardenfold/contracts";
import { useState, type FormEvent } from "react";

import {
    technicalRequest,
    type EvidenceRow,
    type Execution,
    type ResultRow,
    type Revision,
} from "../../api/technical-client";

type Copy = Record<string, string>;
type UploadState =
    | "idle"
    | "hashing"
    | "reserved"
    | "uploading"
    | "uploaded"
    | "finalizing"
    | "finalized"
    | "attaching"
    | "error";

function uploadContent(id: string, file: File, progress: (value: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", `/auth/technical/files/${id}/content`);
        request.setRequestHeader("content-type", "application/octet-stream");
        request.upload.onprogress = (event) => {
            if (event.lengthComputable) progress(Math.round((100 * event.loaded) / event.total));
        };
        request.onload = () =>
            request.status >= 200 && request.status < 300
                ? resolve()
                : reject(new Error("UPLOAD_FAILED"));
        request.onerror = () => reject(new Error("UPLOAD_FAILED"));
        request.send(file);
    });
}

export function EvidenceEditor({
    execution,
    revision,
    results,
    evidence,
    canUpload,
    canDownload,
    copy,
    onSaved,
    onError,
}: {
    execution: Execution;
    revision: Revision;
    results: ResultRow[];
    evidence: EvidenceRow[];
    canUpload: boolean;
    canDownload: boolean;
    copy: Copy;
    onSaved: () => Promise<void>;
    onError: (error: unknown) => void;
}) {
    const [kind, setKind] = useState<"file" | "observation">("file");
    const [file, setFile] = useState<File | null>(null);
    const [description, setDescription] = useState("");
    const [evidenceType, setEvidenceType] = useState("supporting_document");
    const [target, setTarget] = useState("");
    const [observation, setObservation] = useState("");
    const [state, setState] = useState<UploadState>("idle");
    const [progress, setProgress] = useState(0);
    const [validation, setValidation] = useState<string | null>(null);
    const base = `technical-executions/${execution.id}/revisions/${revision.id}/evidence`;
    const input = "mt-1 w-full rounded-control border border-border bg-surface px-3 py-2";

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setValidation(null);
        let storedObjectId: string | undefined;
        try {
            if (kind === "file") {
                if (!file || !canUpload) {
                    setValidation(copy.chooseFile ?? "Choose a file");
                    return;
                }
                setState("hashing");
                const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
                const sha256 = Array.from(new Uint8Array(digest), (byte) =>
                    byte.toString(16).padStart(2, "0"),
                ).join("");
                const request = requestFileUploadSchema.safeParse({
                    idempotencyKey: crypto.randomUUID(),
                    filename: file.name,
                    mediaType: file.type,
                    byteLength: file.size,
                    sha256,
                });
                if (!request.success) {
                    setValidation(
                        request.error.issues[0]?.message ?? copy.invalid ?? "Invalid file",
                    );
                    setState("idle");
                    return;
                }
                const reserved = storedObjectSchema.parse(
                    await technicalRequest("files", { method: "POST", body: request.data }),
                );
                storedObjectId = reserved.id;
                setState("reserved");
                setProgress(0);
                setState("uploading");
                await uploadContent(reserved.id, file, setProgress);
                setState("uploaded");
                setState("finalizing");
                storedObjectSchema.parse(
                    await technicalRequest(`files/${reserved.id}/finalize`, {
                        method: "POST",
                        body: {},
                    }),
                );
                setState("finalized");
            }
            const payload = createTechnicalEvidenceSchema.safeParse({
                expectedRevisionVersion: revision.version,
                target: target ? "result" : "revision",
                resultId: target || null,
                evidenceType,
                description,
                ...(kind === "file"
                    ? { kind, storedObjectId }
                    : { kind, observationText: observation }),
            });
            if (!payload.success) {
                setValidation(
                    payload.error.issues[0]?.message ?? copy.invalid ?? "Invalid evidence",
                );
                setState("idle");
                return;
            }
            setState("attaching");
            await technicalRequest(base, { method: "POST", body: payload.data });
            setFile(null);
            setDescription("");
            setObservation("");
            setProgress(0);
            setState("idle");
            await onSaved();
        } catch (error) {
            setState("error");
            onError(error);
        }
    }

    return (
        <section className="space-y-5 rounded-control border border-border p-5">
            <h2 className="text-xl font-semibold">{copy.evidence}</h2>
            {evidence.length === 0 ? (
                <p className="text-muted-foreground">{copy.noEvidence}</p>
            ) : (
                <ul className="space-y-2">
                    {evidence
                        .filter((item) => !item.removedAt)
                        .map((item) => (
                            <li key={item.id} className="rounded-control bg-surface-muted p-3">
                                <strong>{item.description}</strong>
                                <p className="text-sm">
                                    {item.evidenceType} ·{" "}
                                    {item.kind === "file" ? copy.file : copy.observation}
                                </p>
                                {item.observationText && (
                                    <p className="text-sm whitespace-pre-wrap">
                                        {item.observationText}
                                    </p>
                                )}
                                {item.kind === "file" && canDownload && (
                                    <a
                                        className="text-primary underline"
                                        href={`/auth/technical/${base}/${item.id}/content`}
                                    >
                                        {copy.download}
                                    </a>
                                )}
                            </li>
                        ))}
                </ul>
            )}
            <form
                onSubmit={(event) => void save(event)}
                className="space-y-4 border-t border-border pt-4"
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                        {copy.kind}
                        <select
                            value={kind}
                            onChange={(event) => setKind(event.target.value as typeof kind)}
                            className={input}
                        >
                            <option value="file">{copy.file}</option>
                            <option value="observation">{copy.observation}</option>
                        </select>
                    </label>
                    <label className="text-sm">
                        {copy.target}
                        <select
                            value={target}
                            onChange={(event) => setTarget(event.target.value)}
                            className={input}
                        >
                            <option value="">{copy.revision}</option>
                            {results.map((row) => (
                                <option key={row.id} value={row.id}>
                                    {row.characteristic}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                        {copy.evidenceType}
                        <input
                            value={evidenceType}
                            onChange={(event) => setEvidenceType(event.target.value)}
                            className={input}
                        />
                    </label>
                    <label className="text-sm">
                        {copy.descriptionLabel}
                        <input
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            className={input}
                        />
                    </label>
                </div>
                {kind === "file" ? (
                    <label className="block text-sm">
                        {copy.file}
                        <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,text/plain"
                            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                            className={input}
                        />
                    </label>
                ) : (
                    <label className="block text-sm">
                        {copy.observation}
                        <textarea
                            value={observation}
                            onChange={(event) => setObservation(event.target.value)}
                            className={input}
                            rows={3}
                        />
                    </label>
                )}
                {state !== "idle" && (
                    <p role="status">
                        {copy[state]}
                        {state === "uploading" ? ` ${progress}%` : ""}
                    </p>
                )}
                {validation && (
                    <p role="alert" className="text-destructive">
                        {validation}
                    </p>
                )}
                <button
                    type="submit"
                    disabled={!["idle", "error"].includes(state) || (kind === "file" && !canUpload)}
                    className="rounded-control bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
                >
                    {state === "error" ? copy.retry : copy.attach}
                </button>
            </form>
        </section>
    );
}
