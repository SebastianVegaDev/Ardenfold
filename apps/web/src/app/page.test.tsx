import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
    it("renders the Ardenfold brand", () => {
        render(<HomePage />);

        expect(
            screen.getByRole("heading", {
                name: "Ardenfold",
            }),
        ).toBeInTheDocument();
    });
});
