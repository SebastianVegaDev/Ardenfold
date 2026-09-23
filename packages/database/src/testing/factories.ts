import type {
    NewExternalIdentity,
    NewOrganization,
    NewOrganizationMembership,
    NewOrganizationSite,
    NewParty,
    NewPartyContact,
    NewPartyIdentifier,
    NewUser,
} from "../schema";
import { systemOrganizationRoleIds } from "../schema";

let sequence = 0;

function nextSequence(): number {
    sequence += 1;
    return sequence;
}

export function resetDatabaseFactorySequence(): void {
    sequence = 0;
}

export function buildOrganization(overrides: Partial<NewOrganization> = {}): NewOrganization {
    const value = nextSequence();

    return {
        name: `Test Organization ${value}`,
        defaultLocale: "en",
        defaultTimeZone: "UTC",
        ...overrides,
    };
}

export function buildUser(overrides: Partial<NewUser> = {}): NewUser {
    const value = nextSequence();

    return {
        primaryEmail: `user-${value}@example.test`,
        displayName: `Test User ${value}`,
        preferredLocale: "en",
        preferredTimeZone: "UTC",
        ...overrides,
    };
}

export function buildExternalIdentity(
    userId: string,
    overrides: Partial<NewExternalIdentity> = {},
): NewExternalIdentity {
    const value = nextSequence();

    return {
        userId,
        provider: "test",
        issuer: "https://identity.example.test/",
        subject: `subject-${value}`,
        ...overrides,
    };
}

export function buildOrganizationSite(
    organizationId: string,
    overrides: Partial<NewOrganizationSite> = {},
): NewOrganizationSite {
    const value = nextSequence();

    return {
        organizationId,
        name: `Test Site ${value}`,
        code: `SITE-${value}`,
        ...overrides,
    };
}

export function buildOrganizationMembership(
    organizationId: string,
    userId: string,
    overrides: Partial<NewOrganizationMembership> = {},
): NewOrganizationMembership {
    return {
        organizationId,
        userId,
        status: "active",
        roleId: systemOrganizationRoleIds.viewer,
        ...overrides,
    };
}

export function buildParty(organizationId: string, overrides: Partial<NewParty> = {}): NewParty {
    const value = nextSequence();

    return {
        organizationId,
        kind: "organization",
        displayName: `Test Party ${value}`,
        ...overrides,
    };
}

export function buildPartyContact(
    organizationId: string,
    partyId: string,
    overrides: Partial<NewPartyContact> = {},
): NewPartyContact {
    const value = nextSequence();

    return {
        organizationId,
        partyId,
        displayName: `Test Contact ${value}`,
        ...overrides,
    };
}

export function buildPartyIdentifier(
    organizationId: string,
    partyId: string,
    overrides: Partial<NewPartyIdentifier> = {},
): NewPartyIdentifier {
    const value = nextSequence();

    return {
        organizationId,
        partyId,
        type: "tax_id",
        originalValue: `TAX ${value}`,
        normalizedValue: `TAX${value}`,
        ...overrides,
    };
}
