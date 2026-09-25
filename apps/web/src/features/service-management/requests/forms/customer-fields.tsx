"use client";
import type { PartyDetail, PartySummary } from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { searchCustomers, selectCustomer } from "../api/browser-client";

type Props = Readonly<{
    customer: PartyDetail | null;
    setCustomer: (value: PartyDetail) => void;
    contactId: string;
    setContactId: (value: string) => void;
    requesterName: string;
    setRequesterName: (value: string) => void;
    busy: boolean;
    setBusy: (value: boolean) => void;
    setError: (value: string) => void;
}>;

export function CustomerFields({
    customer,
    setCustomer,
    contactId,
    setContactId,
    requesterName,
    setRequesterName,
    busy,
    setBusy,
    setError,
}: Props) {
    const t = useTranslations("serviceRequests");
    const [customerQuery, setCustomerQuery] = useState("");
    const [customerResults, setCustomerResults] = useState<PartySummary[]>([]);
    const [searched, setSearched] = useState(false);
    const [moreResults, setMoreResults] = useState(false);
    async function findCustomer() {
        setBusy(true);
        setError("");
        try {
            const result = await searchCustomers(customerQuery.trim());
            setCustomerResults(result.data);
            setMoreResults(result.nextCursor !== null);
            setSearched(true);
        } catch {
            setError(t("lookupError"));
        } finally {
            setBusy(false);
        }
    }

    async function chooseCustomer(id: string) {
        setBusy(true);
        setError("");
        try {
            setCustomer(await selectCustomer(id));
            setContactId("");
            setCustomerResults([]);
            setSearched(false);
        } catch {
            setError(t("lookupError"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section
            className="space-y-4 rounded-card border border-border bg-surface p-5"
            aria-labelledby="request-customer-heading"
        >
            <h2 id="request-customer-heading" className="font-display text-xl font-semibold">
                {t("customerSection")}
            </h2>
            {customer ? (
                <p>
                    {t("selectedCustomer")}: <strong>{customer.displayName}</strong>
                </p>
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-52 flex-1">
                    <Label htmlFor="request-customer-search">{t("customerSearch")}</Label>
                    <Input
                        id="request-customer-search"
                        type="search"
                        value={customerQuery}
                        onChange={(event) => setCustomerQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                if (!busy && (!customerQuery || customerQuery.trim().length >= 2))
                                    void findCustomer();
                            }
                        }}
                        maxLength={100}
                    />
                </div>
                <Button
                    type="button"
                    variant="outline"
                    disabled={busy || (customerQuery.length > 0 && customerQuery.trim().length < 2)}
                    onClick={() => void findCustomer()}
                >
                    {t("search")}
                </Button>
            </div>
            {customerResults.length ? (
                <ul className="max-h-56 space-y-1 overflow-auto" aria-label={t("customerResults")}>
                    {customerResults.map((party) => (
                        <li key={party.id}>
                            <Button
                                type="button"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => void chooseCustomer(party.id)}
                            >
                                {party.displayName}
                            </Button>
                        </li>
                    ))}
                </ul>
            ) : null}
            {searched && !customerResults.length ? (
                <p role="status">{t("noLookupResults")}</p>
            ) : null}
            {searched && moreResults ? (
                <p className="text-sm text-muted-foreground">{t("refineSearch")}</p>
            ) : null}
            {customer ? (
                <div>
                    <Label htmlFor="request-contact">{t("contact")}</Label>
                    <select
                        id="request-contact"
                        className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                        value={contactId}
                        onChange={(event) => setContactId(event.target.value)}
                    >
                        <option value="">{t("noContact")}</option>
                        {customer.contacts.map((contact) => (
                            <option key={contact.id} value={contact.id}>
                                {contact.displayName}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}
            <div>
                <Label htmlFor="requester-name">{t("requesterName")}</Label>
                <Input
                    id="requester-name"
                    value={requesterName}
                    onChange={(event) => setRequesterName(event.target.value)}
                    maxLength={200}
                />
            </div>
        </section>
    );
}
