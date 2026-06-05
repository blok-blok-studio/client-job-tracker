import Anthropic from "@anthropic-ai/sdk";

// Model used for AI-tailored contract drafting. Sonnet 4.6 — strong drafting, fast.
const CONTRACT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a contract drafting assistant for Blok Blok Studio (a creative + software agency).

You are given:
1. A BASELINE contract — a legally complete Service Agreement with exact pricing, scope of services, payment terms, and a signature block. This represents the firm's standard legal protections.
2. CUSTOM INSTRUCTIONS from the agency owner describing how this specific contract should differ or what to emphasize/add.

Produce a FINAL contract that follows the custom instructions while keeping every baseline legal protection.

HARD RULES — never break these:
- Any dollar/euro amount, percentage, or total that ALREADY APPEARS in the baseline is LOCKED. Never change, remove, or recalculate it. The baseline "SCOPE OF SERVICES" line items, their prices, deliverables, timelines, the "TOTAL INVESTMENT" totals, and the "PAYMENT TERMS" schedule must match the baseline exactly when present.
- You MAY add prices, fees, or totals ONLY when the baseline has no pricing of its own (e.g. a prompt-only contract with an empty scope/total). In that case use the exact amounts stated in the CUSTOM INSTRUCTIONS — never invent, estimate, or round a number that was not given. If the instructions provide no price, leave pricing out rather than guessing.
- NEVER change the party names, the client name, the company name, or the dates.
- ALWAYS keep an "ACKNOWLEDGMENT AND ACCEPTANCE" closing and the PROVIDER / CLIENT signature block (Name / Date lines) exactly as in the baseline.
- Keep these core protective clauses present (you may reword for tone, but not weaken): Revisions/Change Orders, Timeline/Delivery, Client Responsibilities, Intellectual Property, Confidentiality, Termination, Limitation of Liability.

WHAT YOU MAY DO per the custom instructions:
- Adjust tone, voice, and phrasing of the prose clauses.
- Add new clauses/sections (e.g. NDA language, exclusivity, SLAs, usage rights, specific deliverable notes) when requested.
- Reorder or retitle non-pricing sections for clarity.
- Expand or clarify scope descriptions WITHOUT changing prices or deliverable counts.

OUTPUT:
- Return ONLY the final contract text as plain text. No markdown, no code fences, no commentary, no preamble. Match the plain-text, section-numbered formatting style of the baseline.`;

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:[a-zA-Z]*)?\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Generate an AI-tailored contract body from a deterministic baseline + custom instructions.
 *
 * The baseline carries all locked figures (pricing, payment schedule, signature block); the AI
 * only reshapes the prose around them. On any failure it falls back to the baseline so contract
 * generation never hard-fails.
 */
export async function generateAiContractBody(opts: {
  baselineBody: string;
  customPrompt: string;
  clientName: string;
  companyName: string | null;
}): Promise<{ body: string; usedAi: boolean; error?: string }> {
  const { baselineBody, customPrompt, clientName, companyName } = opts;

  if (!process.env.ANTHROPIC_API_KEY) {
    return { body: baselineBody, usedAi: false, error: "ANTHROPIC_API_KEY not set" };
  }

  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: CONTRACT_MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `CLIENT: ${clientName}${companyName ? ` / ${companyName}` : ""}

CUSTOM INSTRUCTIONS:
${customPrompt}

----- BASELINE CONTRACT (preserve all figures, parties, scope pricing, payment schedule, and signature block exactly) -----
${baselineBody}
----- END BASELINE -----

Produce the final tailored contract now. Plain text only.`,
        },
      ],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const body = stripCodeFences(text);

    // Sanity check: if the model returned something implausibly short, fall back.
    if (body.length < Math.min(400, baselineBody.length / 2)) {
      return { body: baselineBody, usedAi: false, error: "AI output too short — used baseline" };
    }

    return { body, usedAi: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown AI error";
    console.error("[Contract AI] Generation failed, falling back to baseline:", msg);
    return { body: baselineBody, usedAi: false, error: msg };
  }
}
