import type { GroupRow, ResultRow } from "../../api/technical-client";

export function ResultPresentation({
    groups,
    results,
    copy,
}: {
    groups: GroupRow[];
    results: ResultRow[];
    copy: Record<string, string>;
}) {
    const ordered = [...results].sort((left, right) => {
        const leftGroup = groups.find((group) => group.id === left.groupId)?.position ?? 0;
        const rightGroup = groups.find((group) => group.id === right.groupId)?.position ?? 0;
        return leftGroup - rightGroup || left.position - right.position;
    });
    return (
        <div className="space-y-3">
            {ordered.map((row) => {
                const group = groups.find((candidate) => candidate.id === row.groupId);
                const details: [string, string | number | null][] =
                    row.kind === "quantitative"
                        ? [
                              [copy.resolutionText ?? "Resolution", row.resolutionText],
                              [
                                  copy.significantDigits ?? "Significant digits",
                                  row.significantDigits,
                              ],
                              [
                                  copy.uncertaintyText ?? "Uncertainty",
                                  row.uncertaintyText
                                      ? `${row.uncertaintyText} ${row.uncertaintyUnitCode ?? ""}`
                                      : null,
                              ],
                              [copy.uncertaintyCoverage ?? "Coverage", row.uncertaintyCoverage],
                              [copy.toleranceLowerText ?? "Lower limit", row.toleranceLowerText],
                              [copy.toleranceUpperText ?? "Upper limit", row.toleranceUpperText],
                              [copy.toleranceUnitCode ?? "Limit unit", row.toleranceUnitCode],
                              [copy.toleranceRule ?? "Limit rule", row.toleranceRule],
                          ]
                        : row.kind === "categorical"
                          ? [
                                [copy.categoryCode ?? "Code", row.categoryCode],
                                [
                                    copy.categoryMeaningSnapshot ?? "Meaning",
                                    row.categoryMeaningSnapshot,
                                ],
                            ]
                          : row.kind === "textual"
                            ? [[copy.textLanguage ?? "Language", row.textLanguage]]
                            : [[copy.missingExplanation ?? "Explanation", row.missingExplanation]];
                if (row.kind !== "missing")
                    details.push(
                        [
                            copy.conformity ?? "Conformity",
                            row.conformity ? (copy[row.conformity] ?? row.conformity) : null,
                        ],
                        [copy.conformityRule ?? "Rule", row.conformityRule],
                    );
                return (
                    <article key={row.id} className="rounded-control bg-surface-muted p-4">
                        <h3 className="font-semibold">
                            {group ? `${group.label} · ` : ""}
                            {row.characteristic}
                        </h3>
                        <p className="mt-1 whitespace-pre-wrap">
                            {row.kind === "quantitative"
                                ? `${row.decimalValueText} ${row.unitCode}`
                                : row.kind === "categorical"
                                  ? row.categoryLabel
                                  : row.kind === "textual"
                                    ? row.textValue
                                    : `${copy.missing}: ${copy[row.missingReason ?? "not_observed"]}`}
                        </p>
                        {row.contextNote && (
                            <p className="mt-1 text-sm text-muted-foreground">{row.contextNote}</p>
                        )}
                        <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                            {details
                                .filter(([, value]) => value !== null)
                                .map(([label, value]) => (
                                    <div key={label}>
                                        <dt className="inline font-medium">{label}: </dt>
                                        <dd className="inline">{value}</dd>
                                    </div>
                                ))}
                        </dl>
                    </article>
                );
            })}
        </div>
    );
}
