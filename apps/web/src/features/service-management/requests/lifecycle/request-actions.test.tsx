import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import messages from "@/i18n/messages/en.json";

import { RequestWebError, submitRequest } from "../api/browser-client";
import { RequestActions } from "./request-actions";
import type * as BrowserClient from "../api/browser-client";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../api/browser-client", async (importOriginal) => ({
    ...(await importOriginal<typeof BrowserClient>()),
    submitRequest: vi.fn(),
}));

describe("RequestActions", () => {
    it("requires a reason and surfaces a server-rejected terminal transition", async () => {
        vi.mocked(submitRequest).mockRejectedValue(
            new RequestWebError(409, "SERVICE_REQUEST_TERMINAL"),
        );
        render(
            <NextIntlClientProvider locale="en" messages={messages}>
                <RequestActions requestId="00000000-0000-4000-8000-000000000001" version={3} />
            </NextIntlClientProvider>,
        );
        expect(screen.getByRole("button", { name: "Cancel request" })).toBeDisabled();
        expect(screen.getByLabelText("Reason for closing or cancelling")).toBeRequired();
        fireEvent.change(screen.getByLabelText("Reason for closing or cancelling"), {
            target: { value: "Customer withdrew" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("This request is finished");
        expect(submitRequest).toHaveBeenCalledWith({
            intent: "cancel",
            requestId: "00000000-0000-4000-8000-000000000001",
            payload: { expectedVersion: 3, reason: "Customer withdrew" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Refresh request" }));
        expect(refresh).toHaveBeenCalled();
    });
});
