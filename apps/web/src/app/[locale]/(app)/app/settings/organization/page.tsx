import { Button, Input, Label } from "@ardenfold/ui";
import { getTranslations } from "next-intl/server";

import { getActiveOrganization, getOrganizationManagementData } from "@/auth/api-client";
import { getActiveOrganizationSession } from "@/auth/server-organization";
import { InvitationForm } from "@/components/invitation-form";
import type { Locale } from "@/i18n/locales";

type SettingsPageProps = Readonly<{
    params: Promise<{ locale: Locale }>;
    searchParams: Promise<{ status?: string }>;
}>;

export default async function OrganizationSettingsPage({
    params,
    searchParams,
}: SettingsPageProps) {
    const [{ locale }, query, translate, resolved] = await Promise.all([
        params,
        searchParams,
        getTranslations("organizationSettings"),
        getActiveOrganizationSession(),
    ]);
    const [organization, data] = await Promise.all([
        getActiveOrganization(resolved.session.accessToken, resolved.organization.id),
        getOrganizationManagementData(resolved.session.accessToken, resolved.organization.id),
    ]);
    const canUpdate = organization.permissions.includes("organization.update");
    const canManageSites = organization.permissions.includes("sites.manage");
    const canInvite = organization.permissions.includes("members.invite");
    const canManageMembers = organization.permissions.includes("members.manage");

    return (
        <div className="mx-auto max-w-6xl space-y-8 p-6 sm:p-8">
            <header>
                <h1 className="font-display text-3xl font-semibold">{translate("title")}</h1>
                <p className="mt-2 text-muted-foreground">{translate("description")}</p>
                {query.status ? (
                    <p className="mt-4 text-sm" role="status">
                        {query.status === "success" ? translate("success") : translate("error")}
                    </p>
                ) : null}
            </header>

            <section className="rounded-card border border-border bg-surface p-5 sm:p-6">
                <h2 className="font-display text-xl font-semibold">{translate("profile.title")}</h2>
                <form
                    action="/auth/organization-management"
                    className="mt-5 grid gap-4 sm:grid-cols-2"
                    method="post"
                >
                    <input name="intent" type="hidden" value="update-profile" />
                    <input name="locale" type="hidden" value={locale} />
                    <div className="sm:col-span-2">
                        <Label htmlFor="profile-name">{translate("profile.name")}</Label>
                        <Input
                            defaultValue={organization.name}
                            disabled={!canUpdate}
                            id="profile-name"
                            name="name"
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="profile-locale">{translate("profile.locale")}</Label>
                        <select
                            className="mt-2 h-10 w-full rounded-control border border-border bg-surface px-3"
                            defaultValue={organization.defaultLocale}
                            disabled={!canUpdate}
                            id="profile-locale"
                            name="defaultLocale"
                        >
                            <option value="en">English</option>
                            <option value="es">Español</option>
                        </select>
                    </div>
                    <div>
                        <Label htmlFor="profile-timezone">{translate("profile.timeZone")}</Label>
                        <Input
                            defaultValue={organization.defaultTimeZone}
                            disabled={!canUpdate}
                            id="profile-timezone"
                            name="defaultTimeZone"
                        />
                    </div>
                    {canUpdate ? (
                        <Button className="sm:col-span-2 sm:justify-self-start" type="submit">
                            {translate("profile.save")}
                        </Button>
                    ) : null}
                </form>
            </section>

            <section className="rounded-card border border-border bg-surface p-5 sm:p-6">
                <h2 className="font-display text-xl font-semibold">{translate("sites.title")}</h2>
                {data.sites.data.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">{translate("sites.empty")}</p>
                ) : (
                    <ul className="mt-4 divide-y divide-border">
                        {data.sites.data.map((site) => (
                            <li className="py-3" key={site.id}>
                                <span className="font-medium">{site.name}</span>
                                {site.code ? (
                                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                                        {site.code}
                                    </span>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
                {canManageSites ? (
                    <form
                        action="/auth/organization-management"
                        className="mt-5 grid gap-4 sm:grid-cols-3"
                        method="post"
                    >
                        <input name="intent" type="hidden" value="create-site" />
                        <input name="locale" type="hidden" value={locale} />
                        <div>
                            <Label htmlFor="site-name">{translate("sites.name")}</Label>
                            <Input id="site-name" name="name" required />
                        </div>
                        <div>
                            <Label htmlFor="site-code">{translate("sites.code")}</Label>
                            <Input id="site-code" name="code" />
                        </div>
                        <div>
                            <Label htmlFor="site-timezone">{translate("sites.timeZone")}</Label>
                            <Input id="site-timezone" name="timeZone" />
                        </div>
                        <Button className="sm:col-span-3 sm:justify-self-start" type="submit">
                            {translate("sites.create")}
                        </Button>
                    </form>
                ) : null}
            </section>

            <section className="rounded-card border border-border bg-surface p-5 sm:p-6">
                <h2 className="font-display text-xl font-semibold">{translate("members.title")}</h2>
                <div className="mt-4 space-y-3">
                    {data.members.data.map((member) => (
                        <article
                            className="flex flex-col gap-3 rounded-control border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                            key={member.membershipId}
                        >
                            <div>
                                <p className="font-medium">{member.displayName ?? member.email}</p>
                                <p className="text-xs text-muted-foreground">
                                    {member.email} · {translate(`roles.${member.role}`)} ·{" "}
                                    {translate(`statuses.${member.status}`)}
                                </p>
                            </div>
                            {canManageMembers ? (
                                <div className="flex flex-wrap gap-2">
                                    <form action="/auth/organization-management" method="post">
                                        <input name="intent" type="hidden" value="update-role" />
                                        <input name="locale" type="hidden" value={locale} />
                                        <input
                                            name="id"
                                            type="hidden"
                                            value={member.membershipId}
                                        />
                                        <select
                                            aria-label={translate("members.role")}
                                            className="h-9 rounded-control border border-border bg-surface px-2 text-sm"
                                            defaultValue={member.role}
                                            name="role"
                                        >
                                            <option value="owner">
                                                {translate("roles.owner")}
                                            </option>
                                            <option value="administrator">
                                                {translate("roles.administrator")}
                                            </option>
                                            <option value="member">
                                                {translate("roles.member")}
                                            </option>
                                            <option value="viewer">
                                                {translate("roles.viewer")}
                                            </option>
                                        </select>
                                        <Button className="ml-2" size="sm" type="submit">
                                            {translate("members.changeRole")}
                                        </Button>
                                    </form>
                                    {member.status === "active" ? (
                                        <form action="/auth/organization-management" method="post">
                                            <input
                                                name="intent"
                                                type="hidden"
                                                value="suspend-member"
                                            />
                                            <input name="locale" type="hidden" value={locale} />
                                            <input
                                                name="id"
                                                type="hidden"
                                                value={member.membershipId}
                                            />
                                            <Button size="sm" type="submit" variant="outline">
                                                {translate("members.suspend")}
                                            </Button>
                                        </form>
                                    ) : null}
                                    <form action="/auth/organization-management" method="post">
                                        <input name="intent" type="hidden" value="remove-member" />
                                        <input name="locale" type="hidden" value={locale} />
                                        <input
                                            name="id"
                                            type="hidden"
                                            value={member.membershipId}
                                        />
                                        <Button size="sm" type="submit" variant="destructive">
                                            {translate("members.remove")}
                                        </Button>
                                    </form>
                                </div>
                            ) : null}
                        </article>
                    ))}
                </div>
            </section>

            <section className="rounded-card border border-border bg-surface p-5 sm:p-6">
                <h2 className="font-display text-xl font-semibold">
                    {translate("invitations.title")}
                </h2>
                {canInvite ? (
                    <div className="mt-5">
                        <InvitationForm
                            copy={{
                                email: translate("invitations.email"),
                                role: translate("members.role"),
                                invite: translate("invitations.invite"),
                                owner: translate("roles.owner"),
                                administrator: translate("roles.administrator"),
                                member: translate("roles.member"),
                                viewer: translate("roles.viewer"),
                                created: translate("invitations.created"),
                                copyHint: translate("invitations.copyHint"),
                                error: translate("error"),
                            }}
                            locale={locale}
                        />
                    </div>
                ) : null}
                {data.invitations.data.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                        {translate("invitations.empty")}
                    </p>
                ) : (
                    <ul className="mt-4 divide-y divide-border">
                        {data.invitations.data.map((invitation) => (
                            <li
                                className="flex items-center justify-between gap-3 py-3"
                                key={invitation.id}
                            >
                                <div>
                                    <p className="text-sm font-medium">{invitation.email}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {translate(`roles.${invitation.role}`)} ·{" "}
                                        {translate(`invitationStatuses.${invitation.status}`)}
                                    </p>
                                </div>
                                {canInvite && invitation.status === "pending" ? (
                                    <form action="/auth/organization-management" method="post">
                                        <input
                                            name="intent"
                                            type="hidden"
                                            value="cancel-invitation"
                                        />
                                        <input name="locale" type="hidden" value={locale} />
                                        <input name="id" type="hidden" value={invitation.id} />
                                        <Button size="sm" type="submit" variant="outline">
                                            {translate("invitations.cancel")}
                                        </Button>
                                    </form>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
