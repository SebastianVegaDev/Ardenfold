import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = process.cwd();
const styleSheet = readFileSync(resolve(webRoot, "src/app/globals.css"), "utf8");

function declarations(selector: string): Readonly<Record<string, string>> {
    const start = styleSheet.indexOf(`${selector} {`);

    if (start < 0) {
        throw new Error(`Missing ${selector} token block.`);
    }

    const body = styleSheet.slice(start, styleSheet.indexOf("}", start));

    const tokens: Record<string, string> = {};

    for (const match of body.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)) {
        const name = match[1];
        const value = match[2];

        if (name !== undefined && value !== undefined) {
            tokens[name] = value;
        }
    }

    return tokens;
}

function luminance(hex: string): number {
    const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((channel) => {
        const value = Number.parseInt(channel, 16) / 255;

        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrast(foreground: string, background: string): number {
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    const light = Math.max(foregroundLuminance, backgroundLuminance);
    const dark = Math.min(foregroundLuminance, backgroundLuminance);

    return (light + 0.05) / (dark + 0.05);
}

describe("design system foundations", () => {
    it("keeps normal interface text combinations above WCAG AA contrast", () => {
        const light = declarations(":root");
        const dark = declarations(".dark");

        const pairs = [
            [light.foreground, light.background],
            [light["muted-foreground"], light.surface],
            [light["primary-foreground"], light.primary],
            [light["secondary-foreground"], light.secondary],
            [dark.foreground, dark.background],
            [dark["muted-foreground"], dark.surface],
            [dark["primary-foreground"], dark.primary],
            [dark["secondary-foreground"], dark.secondary],
        ] as const;

        for (const [foreground, background] of pairs) {
            expect(foreground).toBeDefined();
            expect(background).toBeDefined();
            expect(
                contrast(foreground ?? "#000000", background ?? "#ffffff"),
            ).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("publishes the approved logo masters", () => {
        const approvedAssets = {
            "logo-primary-light.svg":
                "03e24f4cdd1fb63023f6527d2044f865b373f32d931745461eac5ce4ffcb134b",
            "logo-primary-dark.svg":
                "a625589c4e3809e91b5613ed9a6bce145aeb84b98db28b12794474e26a817319",
            "isotype-color.svg": "8275e1f35426ff47d9448a62d9129a89f6d3295d1780e2ac834be99276b53f17",
        } as const;

        for (const [asset, approvedHash] of Object.entries(approvedAssets)) {
            const published = readFileSync(resolve(webRoot, `public/brand/${asset}`), "utf8");

            expect(createHash("sha256").update(published).digest("hex")).toBe(approvedHash);
        }
    });
});
