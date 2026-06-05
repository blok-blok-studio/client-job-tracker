import Anthropic from "@anthropic-ai/sdk";

// Model used for AI-tailored contract drafting. Sonnet 4.6 — strong drafting, fast.
const CONTRACT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a contract drafting assistant for Blok Blok Studio (a creative + software agency).

You are given:
1. A BASELINE contract — a legally complete Service Agreement with exact pricing, scope of services, payment terms, and a signature block. This represents the firm's standard legal protections.
2. CUSTOM INSTRUCTIONS from the agency owner describing how this specific contract should differ or what to emphasize/add.

Produce a FINAL contract that follows the custom instructions while keeping every baseline legal protection.

PRICING — read carefully:
- If the CUSTOM INSTRUCTIONS state a price, fee, amount, or total, you MUST include it verbatim in the contract — write it into the SCOPE OF SERVICES, TOTAL INVESTMENT, and (where relevant) PAYMENT TERMS sections. An explicit price from the instructions ALWAYS appears in the final contract. This is the single most important requirement.
- Use the exact amounts given in the instructions. Never invent, estimate, or round a number that was not provided. If the instructions provide no price at all, leave pricing out rather than guessing.
- The baseline may carry pre-computed line items and totals from selected service packages. Keep those baseline figures intact, and ADD the instruction's prices alongside them — do not silently drop either. If a price in the instructions conflicts with a baseline figure for the same item, follow the instructions (the user is overriding it on purpose).

OTHER HARD RULES — never break these:
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
