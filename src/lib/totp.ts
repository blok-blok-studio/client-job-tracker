import crypto from "crypto";

// RFC 6238 TOTP + RFC 4226 HOTP, implemented on Node crypto so the auth path
// takes on no third-party dependency. Verified against the RFC 6238 test
// vectors in scripts/test-totp.ts.

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALGO = "sha1"; // authenticator-app default (Google Authenticator, Authy, 1Password)

// --- base32 (RFC 4648, no padding) — the encoding authenticator apps expect ---
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// Generate a fresh random secret (160-bit, the RFC-recommended size for SHA-1)
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

// HOTP for a specific counter (RFC 4226 dynamic truncation)
function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter (safe for TOTP step counts well within 2^53)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac(ALGO, secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

// Current TOTP code for a base32 secret
export function totpCode(base32Secret: string, forTime = Date.now()): string {
  const counter = Math.floor(forTime / 1000 / STEP_SECONDS);
  return hotp(base32Decode(base32Secret), counter);
}

// Verify a submitted code, tolerating +/- `window` steps of clock drift
// (default 1 step = 30s either side). Constant-time compare per candidate.
export function verifyTotp(base32Secret: string, token: string, window = 1, forTime = Date.now()): boolean {
  const clean = (token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const secret = base32Decode(base32Secret);
  const counter = Math.floor(forTime / 1000 / STEP_SECONDS);
  for (let i = -window; i <= window; i++) {
    const candidate = hotp(secret, counter + i);
    // timingSafeEqual needs equal-length buffers; both are 6 ASCII digits
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) return true;
  }
  return false;
}

// otpauth:// URI that authenticator apps turn into a QR code
export function totpAuthUri(base32Secret: string, account: string, issuer = "Blok Blok Command Center"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: base32Secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// One-time backup recovery codes (shown once, stored hashed)
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 10 hex chars grouped as XXXXX-XXXXX
    const raw = crypto.randomBytes(5).toString("hex");
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}
