import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
    Button,
    Dialog,
    DialogCloseButton,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
    Input,
    Label,
    Spinner,
} from "./index";

describe("UI foundations", () => {
    it("associates labels and inputs without embedding product copy", () => {
        render(
            <div>
                <Label htmlFor="reference">Reference</Label>
                <Input id="reference" />
            </div>,
        );

        expect(screen.getByLabelText("Reference")).toBeInTheDocument();
    });

    it("exposes loading status through a translated consumer label", () => {
        render(<Spinner label="Saving" />);

        expect(screen.getByRole("status")).toHaveAccessibleName("Saving");
    });

    it("provides an accessible keyboard-oriented dialog primitive", () => {
        render(
            <Dialog>
                <DialogTrigger asChild>
                    <Button>Open</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogTitle>Confirm change</DialogTitle>
                    <DialogDescription>Review this action.</DialogDescription>
                    <DialogCloseButton label="Close" />
                </DialogContent>
            </Dialog>,
        );

        fireEvent.click(screen.getByRole("button", { name: "Open" }));

        expect(screen.getByRole("dialog", { name: "Confirm change" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});
