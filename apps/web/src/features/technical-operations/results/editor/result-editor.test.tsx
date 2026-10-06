import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Execution, Revision } from "../../api/technical-client";
import { technicalRequest } from "../../api/technical-client";
import { ResultEditor } from "./result-editor";

vi.mock("../../api/technical-client", () => ({ technicalRequest: vi.fn().mockResolvedValue({}) }));

const execution = { id: "00000000-0000-4000-8000-000000000001" } as Execution;
const revision = { id: "00000000-0000-4000-8000-000000000002", version: 1 } as Revision;
const copy = {
    results: "Results",
    noResults: "No results",
    group: "Group",
    addGroup: "Add group",
    addResult: "Add result",
    kind: "Kind",
    quantitative: "Quantitative",
    categorical: "Categorical",
    textual: "Textual",
    missing: "Missing",
    ungrouped: "Ungrouped",
    characteristic: "Characteristic",
    contextNote: "Context",
    decimalValueText: "Exact decimal",
    unitCode: "Unit",
    save: "Save",
    missingReason: "Missing reason",
    not_observed: "Not observed",
    not_applicable: "Not applicable",
    unavailable: "Unavailable",
    missingExplanation: "Explanation",
    conformity: "Conformity",
};

describe("technical result entry", () => {
    beforeEach(() => vi.clearAllMocks());

    it("preserves exact decimal text and represents missing values explicitly", async () => {
        render(
            <ResultEditor
                execution={execution}
                revision={revision}
                groups={[]}
                results={[]}
                copy={copy}
                onSaved={async () => {}}
                onError={vi.fn()}
            />,
        );
        fireEvent.change(screen.getByLabelText("Characteristic"), { target: { value: "Length" } });
        fireEvent.change(screen.getByLabelText("Exact decimal"), {
            target: { value: "1234567890123456.123456789012" },
        });
        fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "mm" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(vi.mocked(technicalRequest)).toHaveBeenCalledTimes(1));
        expect(vi.mocked(technicalRequest).mock.calls[0]?.[1]).toMatchObject({
            body: {
                value: {
                    kind: "quantitative",
                    decimalValueText: "1234567890123456.123456789012",
                    unitCode: "mm",
                },
            },
        });

        fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "missing" } });
        fireEvent.change(screen.getByLabelText("Characteristic"), {
            target: { value: "Temperature" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(vi.mocked(technicalRequest)).toHaveBeenCalledTimes(2));
        const submitted = vi.mocked(technicalRequest).mock.calls[1]?.[1] as {
            body: { value: Record<string, unknown> };
        };
        expect(submitted.body.value).toMatchObject({
            kind: "missing",
            missingReason: "not_observed",
        });
        expect(submitted.body.value).not.toHaveProperty("decimalValueText");
    });
});
