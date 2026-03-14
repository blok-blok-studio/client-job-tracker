/**
 * Sets up the Telegram bot webhook.
 *
 * Usage:
 *   npx tsx scripts/setup-telegram.ts https://your-domain.com
 *
 * This registers the webhook URL with Telegram so incoming messages
 * are forwarded to your /api/telegram/webhook endpoint.
 *
 * Also sets bot commands so users see them in the Telegram menu.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.CRON_SECRET || "";

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set in your environment.");
  process.exit(1);
}

const appUrl = process.argv[2];
if (!appUrl) {
  console.error("Usage: npx tsx scripts/setup-telegram.ts https://your-domain.com");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function main() {
  // 1. Set webhook
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  console.log(`Setting webhook → ${webhookUrl}`);

  const whRes = await fetch(`${API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: WEBHOOK_SECRET || undefined,
      allowed_updates: ["message"],
    }),
  });
  const whData = await whRes.json();

  if (whData.ok) {
    console.log("Webhook set successfully.");
  } else {
    console.error("Failed to set webhook:", whData.description);
    process.exit(1);
  }

  // 2. Set bot commands (shows in Telegram menu)
  const commands = [
    { command: "start", description: "Connect your account" },
    { command: "status", description: "Quick operational dashboard" },
    { command: "run", description: "Trigger agent cycle" },
    { command: "tickets", description: "List open support tickets" },
    { command: "clients", description: "List active clients" },
    { command: "help", description: "Show all commands" },
  ];

  const cmdRes = await fetch(`${API}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  });
  const cmdData = await cmdRes.json();

  if (cmdData.ok) {
    console.log("Bot commands registered.");
  } else {
    console.error("Failed to set commands:", cmdData.description);
  }

  // 3. Set bot description
  const descRes = await fetch(`${API}/setMyDescription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: "Blok Blok Studio support and operations bot. Clients: message here for support. Admin: manage everything via natural language.",
    }),
  });
  const descData = await descRes.json();

  if (descData.ok) {
    console.log("Bot description set.");
  } else {
    console.error("Failed to set description:", descData.description);
  }

  // 4. Verify webhook info
  const infoRes = await fetch(`${API}/getWebhookInfo`);
  const infoData = await infoRes.json();
  console.log("\nWebhook info:");
  console.log(`  URL: ${infoData.result?.url}`);
  console.log(`  Pending updates: ${infoData.result?.pending_update_count}`);
  console.log(`  Has secret: ${!!infoData.result?.has_custom_certificate || "using secret_token"}`);
  console.log(`  Last error: ${infoData.result?.last_error_message || "none"}`);

  console.log("\nBot is ready! Text @blokbloksupport_bot to test.");
}

main().catch(console.error);
