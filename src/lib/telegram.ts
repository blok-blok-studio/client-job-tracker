const TELEGRAM_API = "https://api.telegram.org/bot";

function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML"
): Promise<{ success: boolean; error?: string }> {
  const token = getToken();
  if (!token) {
    console.warn("[Telegram] Bot token not configured");
    return { success: false, error: "Telegram not configured" };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.description || `Telegram API error ${res.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export function getWebhookSecret(): string {
  return process.env.TELEGRAM_WEBHOOK_SECRET || process.env.CRON_SECRET || "";
}

export async function setTelegramWebhook(url: string): Promise<{ success: boolean; error?: string }> {
  const token = getToken();
  if (!token) return { success: false, error: "Telegram not configured" };

  const secret = getWebhookSecret();

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        ...(secret ? { secret_token: secret } : {}),
      }),
    });

    const data = await res.json();
    return data.ok ? { success: true } : { success: false, error: data.description };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
