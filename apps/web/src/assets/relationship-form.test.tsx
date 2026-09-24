import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AssetRelationship } from "@ardenfold/contracts";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import messages from "@/i18n/messages/en.json";

import { RelationshipForm } from "./relationship-form";

const assetId = "00000000-0000-4000-8000-000000000001";
const current: AssetRelationship = {
    id: "00000000-0000-4000-8000-000000000002",
    kind: "location",
    subject: "site",
    partyId: null,
    siteId: "00000000-0000-4000-8000-000000000003",
    partyAddressId: null,
    locationDescription: "North warehouse",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    supersedesId: null,
    supersededAt: null,
    revisionReason: null,
    aggregateVersion: 2,
    recordedByUserId: "00000000-0000-4000-8000-000000000004",
    recordedAt: "2026-01-01T00:00:00.000Z",
};

function renderForm(relationship: AssetRelationship | null) {
    return render(
        <NextIntlClientProvider locale="en" messages={messages}>
            <RelationshipForm
                locale="en"
                assetId={assetId}
                version={3}
                kind="location"
                current={relationship}
                parties={[]}
                sites={[
                    {
                        id: current.siteId!,
                        organizationId: assetId,
                        name: "North",
                        code: null,
                        timeZone: null,
                        isActive: true,
                    },
                ]}
            />
        </NextIntlClientProvider>,
    );
}

describe("RelationshipForm", () => {
    it("only submits target fields for the selected location subject", () => {
        renderForm(null);
        fireEvent.click(screen.getByText("Start or change relationship", { selector: "summary" }));
        const form = screen
            .getByRole("button", { name: "Start or change relationship" })
            .closest("form")!;
        expect(within(form).getByRole("combobox", { name: "Select site" })).toBeRequired();
        expect(form.querySelector('[name="partyId"]')).toBeNull();
        expect(form.querySelector('[name="locationDescription"]')).toBeRequired();

        fireEvent.change(within(form).getByRole("combobox", { name: "Related to" }), {
            target: { value: "freeform" },
        });
        expect(form.querySelector('[name="siteId"]')).toBeNull();
        expect(form.querySelector('[name="locationDescription"]')).toBeRequired();
    });

    it("keeps correction and end workflows separate from a current relationship", () => {
        renderForm(current);
        fireEvent.click(screen.getByText("Correct current relationship", { selector: "summary" }));
        const correction = screen
            .getByRole("button", { name: "Correct current relationship" })
            .closest("form")!;
        expect(correction.querySelector('[name="reason"]')).toBeRequired();
        expect(correction.querySelector('[name="expectedVersion"]')).toHaveValue("3");
        expect(correction.querySelector('[name="locationDescription"]')).toHaveValue(
            "North warehouse",
        );

        fireEvent.click(screen.getByText("End relationship", { selector: "summary" }));
        const end = screen.getByRole("button", { name: "End relationship" }).closest("form")!;
        expect(end.querySelector('[name="subject"]')).toBeNull();
        expect(end.querySelector('[name="effectiveAt"]')).toBeRequired();
    });
});
