import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = "sha512";

function deriveKey(): Buffer {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  const salt = process.env.ENCRYPTION_SALT;

  if (!masterKey || masterKey.length !== 64) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY must be a 64-character hex string. Run: npx tsx scripts/generate-secrets.ts"
    );
  }
  if (!salt || salt.length !== 32) {
    throw new Error(
      "ENCRYPTION_SALT must be a 32-character hex string. Run: npx tsx scripts/generate-secrets.ts"
    );
  }

  return crypto.pbkdf2Sync(
    Buffer.from(masterKey, "hex"),
    Buffer.from(salt, "hex"),
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    PBKDF2_DIGEST
  );
}

export function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  // Append auth tag to encrypted data
  const encryptedWithTag = Buffer.concat([
    Buffer.from(encrypted, "base64"),
    authTag,
  ]).toString("base64");

  return {
    encrypted: encryptedWithTag,
    iv: iv.toString("base64"),
  };
}

export function decrypt(encryptedData: string, iv: string): string {
  const key = deriveKey();
  const ivBuffer = Buffer.from(iv, "base64");
  const encryptedBuffer = Buffer.from(encryptedData, "base64");

  // Extract auth tag from end of encrypted data
  const authTag = encryptedBuffer.subarray(
    encryptedBuffer.length - AUTH_TAG_LENGTH
  );
  const encrypted = encryptedBuffer.subarray(
    0,
    encryptedBuffer.length - AUTH_TAG_LENGTH
  );

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

export function encryptField(value: string | null | undefined): {
  encrypted: string;
  iv: string;
} | null {
  if (!value) return null;
  try {
    return encrypt(value);
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Failed to encrypt field");
  }
}

export function decryptField(
  encrypted: string | null | undefined,
  iv: string | null | undefined
): string {
  if (!encrypted || !iv) return "";
  try {
    return decrypt(encrypted, iv);
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[DECRYPTION_ERROR]";
  }
}

export function maskValue(value: string): string {
  if (value.length <= 4) return "••••••••";
  return "••••••••" + value.slice(-4);
}
