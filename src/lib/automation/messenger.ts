/**
 * Instagram/Facebook DM Sender
 * Sends messages, quick replies, and media via Meta's messaging API.
 */

import { resilientFetch, humanDelay, buildApiHeaders } from "@/lib/social/http";

const GRAPH_API = "https://graph.facebook.com/v21.0";

interface QuickReply {
  content_type: "text";
  title: string;
  payload: string;
}

interface Button {
  type: "postback" | "web_url";
  title: string;
  payload?: string;
  url?: string;
}

export interface SendMessageOptions {
  recipientId: string;
  accessToken: string;
  pageId: string;
  text?: string;
  mediaUrl?: string;
  quickReplies?: QuickReply[];
  buttons?: Button[];
}

/** Send an Instagram DM via the Instagram Messaging API */
export async function sendInstagramDM(options: SendMessageOptions): Promise<{ messageId: string }> {
  const { recipientId, accessToken, pageId, text, mediaUrl, quickReplies } = options;

  await humanDelay(500, 1500);

  const message: Record<string, unknown> = {};

  if (mediaUrl) {
    message.attachment = {
      type: mediaUrl.match(/\.(mp4|mov|webm)$/i) ? "video" : "image",
      payload: { url: mediaUrl },
    };
  } else if (text) {
    message.text = text;
  }

  if (quickReplies?.length) {
    message.quick_replies = quickReplies;
  }

  const res = await resilientFetch(`${GRAPH_API}/${pageId}/messages`, {
    method: "POST",
    headers: buildApiHeaders(accessToken),
    body: JSON.stringify({
      recipient: { id: recipientId },
      message,
      messaging_type: "RESPONSE",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Instagram DM failed (${res.status}): ${error}`);
  }

  const data = await res.json();
  return { messageId: data.message_id || data.id };
}

/** Send a Facebook Messenger message */
export async function sendFacebookMessage(options: SendMessageOptions): Promise<{ messageId: string }> {
  const { recipientId, accessToken, pageId, text, mediaUrl, buttons } = options;

  await humanDelay(500, 1500);

  const message: Record<string, unknown> = {};

  if (buttons?.length && text) {
    message.attachment = {
      type: "template",
      payload: {
        template_type: "button",
        text,
        buttons,
      },
    };
  } else if (mediaUrl) {
    message.attachment = {
      type: mediaUrl.match(/\.(mp4|mov|webm)$/i) ? "video" : "image",
      payload: { url: mediaUrl, is_reusable: true },
    };
  } else if (text) {
    message.text = text;
  }

  const res = await resilientFetch(`${GRAPH_API}/${pageId}/messages`, {
    method: "POST",
    headers: buildApiHeaders(accessToken),
    body: JSON.stringify({
      recipient: { id: recipientId },
      message,
      messaging_type: "RESPONSE",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Facebook message failed (${res.status}): ${error}`);
  }

  const data = await res.json();
  return { messageId: data.message_id || data.id };
}

/** Build quick reply objects from simple label/value pairs */
export function buildQuickReplies(options: { label: string; value: string }[]): QuickReply[] {
  return options.map((opt) => ({
    content_type: "text" as const,
    title: opt.label,
    payload: opt.value,
  }));
}

/** Build button objects */
export function buildButtons(options: { label: string; value: string; type?: "postback" | "web_url" }[]): Button[] {
  return options.map((opt) => ({
    type: opt.type || "postback",
    title: opt.label,
    ...(opt.type === "web_url" ? { url: opt.value } : { payload: opt.value }),
  }));
}
