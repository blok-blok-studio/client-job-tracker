// Verify the TOTP implementation against the RFC 6238 Appendix B test vectors
// (SHA-1, 8-digit variant reduced to our 6-digit check) and base32 round-trips.
import { base32Encode, base32Decode, totpCode, verifyTotp, generateTotpSecret } from "../src/lib/totp";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}`); }
}

// base32 round-trip
const sample = Buffer.from("Hello world!");
check("base32 round-trip", base32Decode(base32Encode(sample)).equals(sample));
// known vector: RFC 4648 "foobar" -> MZXW6YTBOI
check("base32 'foobar' = MZXW6YTBOI", base32Encode(Buffer.from("foobar")) === "MZXW6YTBOI");

// RFC 6238 test seed: ASCII "12345678901234567890" (20 bytes), SHA-1.
// Expected 6-digit TOTP (last 6 of the RFC's 8-digit values):
//   T=59        -> 94287082 -> 287082
//   T=1111111109 -> 07081804 -> 081804
//   T=1234567890 -> 89005924 -> 005924
const seed = base32Encode(Buffer.from("12345678901234567890"));
check("TOTP @59s = 287082", totpCode(seed, 59 * 1000) === "287082");
check("TOTP @1111111109s = 081804", totpCode(seed, 1111111109 * 1000) === "081804");
check("TOTP @1234567890s = 005924", totpCode(seed, 1234567890 * 1000) === "005924");

// verify() accepts the right code and drift, rejects wrong/garbage
const now = 1234567890 * 1000;
check("verify accepts current", verifyTotp(seed, "005924", 1, now));
check("verify accepts +1 step drift", verifyTotp(seed, totpCode(seed, now + 30000), 1, now));
check("verify rejects +2 step drift", !verifyTotp(seed, totpCode(seed, now + 60000), 1, now));
check("verify rejects wrong code", !verifyTotp(seed, "000000", 1, now));
check("verify rejects non-numeric", !verifyTotp(seed, "abcdef", 1, now));
check("verify rejects empty", !verifyTotp(seed, "", 1, now));

// generated secrets are valid base32 and self-consistent
const gen = generateTotpSecret();
check("generated secret verifies its own code", verifyTotp(gen, totpCode(gen)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
