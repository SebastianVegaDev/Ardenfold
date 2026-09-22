import { auditActionSchema } from "@ardenfold/contracts";
import { describe, expect, it } from "vitest";

import { auditActionMessageKeys } from "./action-labels";

describe("audit action labels", () => {
    it("maps every stable action identifier to translated web copy", () => {
        expect(Object.keys(auditActionMessageKeys).sort()).toEqual(
            auditActionSchema.options.toSorted(),
        );
    });
});
