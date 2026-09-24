import type { PartyDetail } from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/locales";
import { PartyFormFields } from "./party-form-fields";

type Props = Readonly<{ locale: Locale; party: PartyDetail; canWrite: boolean }>;

const addressFields = [
    "label",
    "line1",
    "line2",
    "locality",
    "region",
    "postalCode",
    "countryCode",
] as const;

export async function AddressesSection({ locale, party, canWrite }: Props) {
    const t = await getTranslations("parties");
    const fields = (intent: string) => (
        <PartyFormFields
            locale={locale}
            partyId={party.id}
            version={party.version}
            intent={intent}
        />
    );

    return (
        <section
            className="rounded-card border border-border bg-surface p-5 sm:p-6"
            aria-labelledby="party-addresses-title"
        >
            <h2 id="party-addresses-title" className="font-display text-xl font-semibold">
                {t("addresses.title")}
            </h2>
            {party.addresses.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("addresses.empty")}</p>
            ) : (
                <div className="mt-4 space-y-4">
                    {party.addresses.map((address) => (
                        <article
                            key={address.id}
                            className="rounded-control border border-border p-4"
                        >
                            <h3 className="font-medium">{address.label}</h3>
                            {canWrite ? (
                                <form
                                    action="/auth/party-management"
                                    method="post"
                                    className="mt-4 grid gap-3 sm:grid-cols-2"
                                >
                                    {fields("update-address")}
                                    <input type="hidden" name="addressId" value={address.id} />
                                    {addressFields.map((name) => (
                                        <div key={name}>
                                            <Label htmlFor={`address-${name}-${address.id}`}>
                                                {t(`addresses.${name}`)}
                                            </Label>
                                            <Input
                                                id={`address-${name}-${address.id}`}
                                                name={name}
                                                defaultValue={address[name] ?? ""}
                                                required={
                                                    name === "label" ||
                                                    name === "line1" ||
                                                    name === "locality" ||
                                                    name === "countryCode"
                                                }
                                                maxLength={name === "countryCode" ? 2 : undefined}
                                            />
                                        </div>
                                    ))}
                                    <Button
                                        className="sm:col-span-2 sm:justify-self-start"
                                        size="sm"
                                        type="submit"
                                    >
                                        {t("addresses.save")}
                                    </Button>
                                </form>
                            ) : (
                                <p className="mt-2 text-sm">
                                    {address.line1}, {address.locality}, {address.countryCode}
                                </p>
                            )}
                            {canWrite ? (
                                <details className="mt-3">
                                    <summary className="cursor-pointer text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                        {t("addresses.confirmRemove")}
                                    </summary>
                                    <form
                                        action="/auth/party-management"
                                        method="post"
                                        className="mt-3"
                                    >
                                        {fields("remove-address")}
                                        <input type="hidden" name="addressId" value={address.id} />
                                        <Button type="submit" variant="destructive" size="sm">
                                            {t("addresses.remove")}
                                        </Button>
                                    </form>
                                </details>
                            ) : null}
                        </article>
                    ))}
                </div>
            )}
            {canWrite ? (
                <form
                    action="/auth/party-management"
                    method="post"
                    className="mt-5 grid gap-4 sm:grid-cols-2"
                >
                    {fields("add-address")}
                    {addressFields.map((name) => (
                        <div key={name}>
                            <Label htmlFor={`add-address-${name}`}>{t(`addresses.${name}`)}</Label>
                            <Input
                                id={`add-address-${name}`}
                                name={name}
                                required={
                                    name === "label" ||
                                    name === "line1" ||
                                    name === "locality" ||
                                    name === "countryCode"
                                }
                                maxLength={name === "countryCode" ? 2 : undefined}
                            />
                        </div>
                    ))}
                    <Button className="sm:col-span-2 sm:justify-self-start" type="submit">
                        {t("addresses.add")}
                    </Button>
                </form>
            ) : null}
        </section>
    );
}
