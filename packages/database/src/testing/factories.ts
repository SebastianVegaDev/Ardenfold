import type {
    NewExternalIdentity,
    NewOrganization,
    NewOrganizationMembership,
    NewOrganizationSite,
    NewUser,
} from "../schema";

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
        ...overrides,
    };
}
