const TELEGRAM_API = "https://api.telegram.org/bot";

function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML",
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }
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
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
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
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.CRON_SECRET || "";
  if (!secret && process.env.NODE_ENV === "production") {
    console.error("[Telegram] TELEGRAM_WEBHOOK_SECRET is not set in production — webhook is unprotected");
  }
  return secret;
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

/** Acknowledge an inline-button tap so Telegram stops the loading spinner. */
export async function answerTelegramCallback(callbackQueryId: string, text?: string): Promise<void> {
  const token = getToken();
  if (!token) return;
  await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
  }).catch(() => {});
}

/** Replace an inline-button message's text (and drop its buttons) once it is handled. */
export async function editTelegramMessage(chatId: string, messageId: number, text: string): Promise<void> {
  const token = getToken();
  if (!token) return;
  await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" }),
  }).catch(() => {});
}
