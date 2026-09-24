import { ContractException } from "../http/contracts";

export function normalizeRegistryIdentifier(value: string): string {
    const normalized = value
        .normalize("NFKC")
        .toUpperCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
    if (!normalized) throw new ContractException("INVALID_IDENTIFIER", 400);
    return normalized;
}
