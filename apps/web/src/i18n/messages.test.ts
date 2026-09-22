import { describe, expect, it } from "vitest";

import english from "./messages/en.json";
import spanish from "./messages/es.json";

function paths(value: unknown, parent = ""): string[] {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return [parent];
    }

    return Object.entries(value).flatMap(([key, child]) => {
        const path = parent === "" ? key : `${parent}.${key}`;

        return paths(child, path);
    });
}

describe("message catalogs", () => {
    it("keeps Spanish and English translation keys in parity", () => {
        expect(paths(spanish).sort()).toEqual(paths(english).sort());
    });
});
