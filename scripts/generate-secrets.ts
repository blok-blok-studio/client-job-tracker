import crypto from "crypto";

const secrets = {
  ENCRYPTION_MASTER_KEY: crypto.randomBytes(32).toString("hex"),
  ENCRYPTION_SALT: crypto.randomBytes(16).toString("hex"),
  AUTH_SECRET: crypto.randomBytes(32).toString("hex"),
  CRON_SECRET: crypto.randomBytes(32).toString("hex"),
  OPENCLAW_WEBHOOK_SECRET: crypto.randomBytes(32).toString("hex"),
};

console.log("\n# Generated Secrets — Add to .env.local\n");
for (const [key, value] of Object.entries(secrets)) {
  console.log(`${key}="${value}"`);
}
console.log(
  "\n# IMPORTANT: Do not commit .env.local to version control.\n"
);
