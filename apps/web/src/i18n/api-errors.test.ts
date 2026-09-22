import { describe, expect, it } from "vitest";

import { getApiErrorMessageKey } from "./api-errors";

describe("API error localization", () => {
    it("maps stable API error codes to message keys and has a safe fallback", () => {
        expect(getApiErrorMessageKey("UNAUTHENTICATED")).toBe("errors.unauthenticated");
        expect(getApiErrorMessageKey("FUTURE_CODE")).toBe("errors.requestRejected");
    });
});
