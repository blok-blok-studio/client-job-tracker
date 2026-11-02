import { encrypt, decrypt } from "@/lib/encryption";
import type { EurBank, UsdBank, OtherBank } from "./settings-core";

/**
 * Bank details at rest. Settings rows and per-invoice seller snapshots keep
 * the EUR/USD account blocks AES-256-GCM encrypted (same master key as the
 * Vault), so a database dump does not hand out account numbers. They are
 * decrypted only when a PDF, the pay page or the owner's detail view renders.
 */
export interface SealedBank {
  bankVault?: { encrypted: string; iv: string } | null;
  eur?: EurBank | null;
  usd?: UsdBank | null;
  otherBanks?: OtherBank[] | null;
}

const EMPTY_EUR: EurBank = { holder: "", iban: "", bic: "", bank: "" };
const EMPTY_USD: UsdBank = { holder: "", bank: "", routing: "", account: "", swift: "", bankAddress: "" };

export function sealBank<T extends SealedBank>(obj: T): T {
  const payload = JSON.stringify({ eur: obj.eur ?? EMPTY_EUR, usd: obj.usd ?? EMPTY_USD, otherBanks: obj.otherBanks ?? [] });
  const { encrypted, iv } = encrypt(payload);
  return { ...obj, bankVault: { encrypted, iv }, eur: null, usd: null, otherBanks: [] };
}

export function openBank<T extends SealedBank>(obj: T): T {
  if (obj.bankVault?.encrypted && obj.bankVault.iv) {
    try {
      const parsed = JSON.parse(decrypt(obj.bankVault.encrypted, obj.bankVault.iv)) as { eur?: EurBank; usd?: UsdBank; otherBanks?: OtherBank[] };
      return { ...obj, eur: { ...EMPTY_EUR, ...(parsed.eur || {}) }, usd: { ...EMPTY_USD, ...(parsed.usd || {}) }, otherBanks: Array.isArray(parsed.otherBanks) ? parsed.otherBanks : [] };
    } catch (err) {
      console.error("[invoicing] bank vault could not be decrypted:", err instanceof Error ? err.message : err);
      return { ...obj, eur: EMPTY_EUR, usd: EMPTY_USD };
    }
  }
  // Legacy plaintext (rows written before sealing) or nothing stored yet
  return { ...obj, eur: obj.eur ?? EMPTY_EUR, usd: obj.usd ?? EMPTY_USD, otherBanks: obj.otherBanks ?? [] };
}

/** True when the object still carries plaintext bank data that should be sealed on the next write. */
export function hasPlaintextBank(obj: SealedBank): boolean {
  return !obj.bankVault && !!(obj.eur?.iban || obj.usd?.account || obj.usd?.routing);
}
