import type { PartyDetail } from "@ardenfold/contracts";
import { Button, Input, Label } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/locales";
import { PartyFormFields } from "./party-form-fields";

type Props = Readonly<{ locale: Locale; party: PartyDetail; canWrite: boolean }>;

export async function ContactsSection({ locale, party, canWrite }: Props) {
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
            aria-labelledby="party-contacts-title"
        >
            <h2 id="party-contacts-title" className="font-display text-xl font-semibold">
                {t("contacts.title")}
            </h2>
            {party.contacts.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("contacts.empty")}</p>
            ) : (
                <div className="mt-4 space-y-5">
                    {party.contacts.map((contact) => (
                        <article
                            key={contact.id}
                            className="rounded-control border border-border p-4"
                        >
                            <h3 className="font-medium">
                                {contact.displayName}
                                {contact.isPrimary ? (
                                    <span className="ml-2 text-xs text-muted-foreground">
                                        {t("contacts.primary")}
                                    </span>
                                ) : null}
                            </h3>
                            {canWrite ? (
                                <form
                                    action="/auth/party-management"
                                    method="post"
                                    className="mt-4 grid gap-3 sm:grid-cols-2"
                                >
                                    {fields("update-contact")}
                                    <input type="hidden" name="contactId" value={contact.id} />
                                    <div>
                                        <Label htmlFor={`contact-name-${contact.id}`}>
                                            {t("contacts.name")}
                                        </Label>
                                        <Input
                                            id={`contact-name-${contact.id}`}
                                            name="displayName"
                                            defaultValue={contact.displayName}
                                            required
                                            maxLength={200}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor={`contact-job-${contact.id}`}>
                                            {t("contacts.jobTitle")}
                                        </Label>
                                        <Input
                                            id={`contact-job-${contact.id}`}
                                            name="jobTitle"
                                            defaultValue={contact.jobTitle ?? ""}
                                            maxLength={120}
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            name="isPrimary"
                                            defaultChecked={contact.isPrimary}
                                        />
                                        {t("contacts.primary")}
                                    </label>
                                    <Button
                                        className="sm:justify-self-start"
                                        size="sm"
                                        type="submit"
                                    >
                                        {t("contacts.save")}
                                    </Button>
                                </form>
                            ) : contact.jobTitle ? (
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {contact.jobTitle}
                                </p>
                            ) : null}
                            <div className="mt-5 border-t border-border pt-4">
                                <h4 className="text-sm font-semibold">{t("channels.title")}</h4>
                                {contact.channels.length ? (
                                    <ul className="mt-3 space-y-3">
                                        {contact.channels.map((channel) => (
                                            <li
                                                key={channel.id}
                                                className="rounded-control bg-surface-muted p-3"
                                            >
                                                {canWrite ? (
                                                    <form
                                                        action="/auth/party-management"
                                                        method="post"
                                                        className="grid gap-3 sm:grid-cols-3"
                                                    >
                                                        {fields("update-channel")}
                                                        <input
                                                            type="hidden"
                                                            name="contactId"
                                                            value={contact.id}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="channelId"
                                                            value={channel.id}
                                                        />
                                                        <div>
                                                            <Label
                                                                htmlFor={`channel-type-${channel.id}`}
                                                            >
                                                                {t("channels.type")}
                                                            </Label>
                                                            <select
                                                                id={`channel-type-${channel.id}`}
                                                                name="type"
                                                                defaultValue={channel.type}
                                                                className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                                                            >
                                                                <option value="email">
                                                                    {t("channels.types.email")}
                                                                </option>
                                                                <option value="phone">
                                                                    {t("channels.types.phone")}
                                                                </option>
                                                                <option value="other">
                                                                    {t("channels.types.other")}
                                                                </option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <Label
                                                                htmlFor={`channel-label-${channel.id}`}
                                                            >
                                                                {t("channels.label")}
                                                            </Label>
                                                            <Input
                                                                id={`channel-label-${channel.id}`}
                                                                name="label"
                                                                defaultValue={channel.label ?? ""}
                                                                maxLength={80}
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label
                                                                htmlFor={`channel-value-${channel.id}`}
                                                            >
                                                                {t("channels.value")}
                                                            </Label>
                                                            <Input
                                                                id={`channel-value-${channel.id}`}
                                                                name="value"
                                                                defaultValue={channel.value}
                                                                required
                                                                maxLength={320}
                                                            />
                                                        </div>
                                                        <Button
                                                            className="sm:justify-self-start"
                                                            size="sm"
                                                            type="submit"
                                                        >
                                                            {t("channels.save")}
                                                        </Button>
                                                    </form>
                                                ) : (
                                                    <p className="text-sm">
                                                        {t(`channels.types.${channel.type}`)} ·{" "}
                                                        {channel.value}
                                                    </p>
                                                )}
                                                {canWrite ? (
                                                    <form
                                                        action="/auth/party-management"
                                                        method="post"
                                                        className="mt-2"
                                                    >
                                                        {fields("remove-channel")}
                                                        <input
                                                            type="hidden"
                                                            name="contactId"
                                                            value={contact.id}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="channelId"
                                                            value={channel.id}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            type="submit"
                                                        >
                                                            {t("channels.remove")}
                                                        </Button>
                                                    </form>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                                {canWrite ? (
                                    <form
                                        action="/auth/party-management"
                                        method="post"
                                        className="mt-4 grid gap-3 sm:grid-cols-3"
                                    >
                                        {fields("add-channel")}
                                        <input type="hidden" name="contactId" value={contact.id} />
                                        <div>
                                            <Label htmlFor={`add-channel-type-${contact.id}`}>
                                                {t("channels.type")}
                                            </Label>
                                            <select
                                                id={`add-channel-type-${contact.id}`}
                                                name="type"
                                                className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                                            >
                                                <option value="email">
                                                    {t("channels.types.email")}
                                                </option>
                                                <option value="phone">
                                                    {t("channels.types.phone")}
                                                </option>
                                                <option value="other">
                                                    {t("channels.types.other")}
                                                </option>
                                            </select>
                                        </div>
                                        <div>
                                            <Label htmlFor={`add-channel-label-${contact.id}`}>
                                                {t("channels.label")}
                                            </Label>
                                            <Input
                                                id={`add-channel-label-${contact.id}`}
                                                name="label"
                                                maxLength={80}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor={`add-channel-value-${contact.id}`}>
                                                {t("channels.value")}
                                            </Label>
                                            <Input
                                                id={`add-channel-value-${contact.id}`}
                                                name="value"
                                                required
                                                maxLength={320}
                                            />
                                        </div>
                                        <Button
                                            size="sm"
                                            className="sm:col-span-3 sm:justify-self-start"
                                            type="submit"
                                        >
                                            {t("channels.add")}
                                        </Button>
                                    </form>
                                ) : null}
                            </div>
                            {canWrite ? (
                                <details className="mt-4">
                                    <summary className="cursor-pointer text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                        {t("contacts.confirmRemove")}
                                    </summary>
                                    <form
                                        action="/auth/party-management"
                                        method="post"
                                        className="mt-3"
                                    >
                                        {fields("remove-contact")}
                                        <input type="hidden" name="contactId" value={contact.id} />
                                        <Button type="submit" variant="destructive" size="sm">
                                            {t("contacts.remove")}
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
                    {fields("add-contact")}
                    <div>
                        <Label htmlFor="add-contact-name">{t("contacts.name")}</Label>
                        <Input id="add-contact-name" name="displayName" required maxLength={200} />
                    </div>
                    <div>
                        <Label htmlFor="add-contact-job">{t("contacts.jobTitle")}</Label>
                        <Input id="add-contact-job" name="jobTitle" maxLength={120} />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="isPrimary" />
                        {t("contacts.primary")}
                    </label>
                    <Button className="sm:justify-self-start" type="submit">
                        {t("contacts.add")}
                    </Button>
                </form>
            ) : null}
        </section>
    );
}
