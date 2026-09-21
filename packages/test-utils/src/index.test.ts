import { describe, expect, it } from "vitest";

import { createMessageCollector } from "./index.js";

describe("createMessageCollector", () => {
    it("collects messages in insertion order", () => {
        const collector = createMessageCollector();

        collector.write("first");
        collector.write("second");

        expect(collector.messages).toEqual(["first", "second"]);
    });
});
