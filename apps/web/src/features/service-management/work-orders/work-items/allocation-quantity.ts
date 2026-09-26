export function quantityUnits(value: string): bigint | null {
    if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value)) return null;
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function unitsToQuantity(units: bigint): string {
    const whole = units / 1_000_000n;
    const fraction = (units % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole.toString();
}
