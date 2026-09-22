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

    it("publishes unchanged approved logo masters", () => {
        const assets = ["logo-primary-light.svg", "logo-primary-dark.svg", "isotype-color.svg"];

        for (const asset of assets) {
            const published = readFileSync(resolve(webRoot, `public/brand/${asset}`), "utf8");
            const master = readFileSync(
                resolve(webRoot, `../../ardenfold-brand-kit/01-logo/${asset}`),
                "utf8",
            );

            expect(published).toBe(master);
        }
    });
});
