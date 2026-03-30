/**
 * Claude AI Responder for DM Automation
 * Generates intelligent responses using conversation context.
 */

import type Anthropic from "@anthropic-ai/sdk";

// Lazy-load Anthropic SDK to prevent it from being bundled into client code
let anthropic: Anthropic | null = null;
async function getClient(): Promise<Anthropic> {
  if (!anthropic) {
    const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
    anthropic = new AnthropicSDK();
  }
  return anthropic;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface AIResponseOptions {
  systemPrompt: string;
  conversationHistory: ConversationMessage[];
  currentMessage: string;
  maxTokens?: number;
  model?: string;
  variables?: Record<string, string>;
}

/** Generate an AI response using Claude */
export async function generateAIResponse(options: AIResponseOptions): Promise<string> {
  const {
    systemPrompt,
    conversationHistory,
    currentMessage,
    maxTokens = 300,
    model = "claude-sonnet-4-5-20250514",
    variables = {},
  } = options;

  // Replace variables in system prompt (e.g., {{clientName}}, {{businessName}})
  let processedPrompt = systemPrompt;
  for (const [key, value] of Object.entries(variables)) {
    processedPrompt = processedPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }

  const client = await getClient();

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user" as const, content: currentMessage },
  ];

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: processedPrompt,
    messages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text || "I appreciate your message! Let me get back to you shortly.";
}

/** Default system prompts for common use cases */
export const DEFAULT_PROMPTS = {
  sales: `You are a friendly sales assistant for {{businessName}}. Your goal is to qualify leads and book consultations. Be conversational, not pushy. Ask about their needs, budget timeline, and preferred contact method. Keep responses under 2-3 sentences. Use emojis sparingly.`,

  support: `You are a helpful customer support agent for {{businessName}}. Answer questions accurately and concisely. If you don't know the answer, say you'll have a team member follow up. Keep responses friendly and under 3 sentences.`,

  booking: `You are a booking assistant for {{businessName}}. Help the customer schedule an appointment. Ask for their preferred date, time, and any special requests. Confirm details before finalizing. Keep responses brief and professional.`,

  faq: `You are an FAQ bot for {{businessName}}. Answer common questions about services, pricing, hours, and location. If the question isn't in your knowledge, offer to connect them with a real person. Be concise.`,
};
