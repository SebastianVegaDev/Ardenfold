import { describe, expect, it } from "vitest";

import { ContractException } from "../http/contracts";
import {
    decodeRegistryCursor,
    encodeRegistryCursor,
    registryFilterKey,
    searchPattern,
} from "./search";

describe("registry search cursors", () => {
    it("binds a cursor to its filters and sort", () => {
        const filters = registryFilterKey({ q: "meter", sort: "name_asc" });
        const encoded = encodeRegistryCursor({
            key: "meter a",
            id: "00000000-0000-4000-8000-000000000001",
            sort: "name_asc",
            filters,
        });
        expect(decodeRegistryCursor(encoded, filters, "INVALID_CURSOR").key).toBe("meter a");
        expect(() =>
            decodeRegistryCursor(
                encoded,
                registryFilterKey({ q: "other", sort: "name_asc" }),
                "INVALID_CURSOR",
            ),
        ).toThrow(ContractException);
        expect(() => decodeRegistryCursor("not-a-cursor", filters, "INVALID_CURSOR")).toThrow(
            ContractException,
        );
    });

    it("normalizes Unicode and treats SQL wildcards as literal input", () => {
        expect(searchPattern("Ｆｏｏ_%")).toBe("%foo\\_\\%%");
    });
});
