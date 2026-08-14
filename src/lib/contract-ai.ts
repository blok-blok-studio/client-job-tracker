import Anthropic from "@anthropic-ai/sdk";

// Model used for AI-tailored contract drafting. Sonnet 4.6 — strong drafting, fast.
const CONTRACT_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a contract drafting assistant for Blok Blok Studio (a creative + software agency).

You are given:
1. A BASELINE contract — a legally complete Service Agreement with exact pricing, scope of services, payment terms, and a signature block. This represents the firm's standard legal protections.
2. CUSTOM INSTRUCTIONS from the agency owner describing how this specific contract should differ or what to emphasize/add. The instructions may include a FULL CONTRACT TEMPLATE (possibly very long) to base the contract on.

Produce a FINAL contract that follows the custom instructions while keeping every baseline legal protection.

WHEN THE INSTRUCTIONS CONTAIN A TEMPLATE:
- Use the pasted template as the primary structure and wording of the final contract — preserve its sections, clauses, and order as faithfully as the instructions allow.
- Substitute the correct party names, client details, and any prices/dates from the instructions or baseline into the template.
- Merge in any baseline protective clause (listed under HARD RULES) that the template lacks; where the template already covers a protection, keep the template's version.
- Always end with the baseline's ACKNOWLEDGMENT AND ACCEPTANCE section and signature block.

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

// Contractor-facing agreements are a different risk profile from client contracts:
// the protections run the other way (we're the buyer of services), and the clauses
// that must survive are the ones the compliance research flagged as load-bearing.
const CONTRACTOR_SYSTEM_PROMPT = `You are a contract drafting assistant for Blok Blok Studio (a creative + software agency) drafting an agreement the agency sends TO an independent contractor it hires.

You are given:
1. A BASELINE agreement — legally complete, already tailored to the contractor's country.
2. CUSTOM INSTRUCTIONS from the agency owner describing how this specific agreement should differ. The instructions may include a FULL AGREEMENT TEMPLATE to base the result on.

Produce a FINAL agreement that follows the custom instructions while keeping every baseline legal protection.

WHEN THE INSTRUCTIONS CONTAIN A TEMPLATE:
- Use the pasted template as the primary structure and wording — preserve its sections, clauses, and order as faithfully as the instructions allow.
- Substitute the correct party names and details from the instructions or baseline.
- Merge in any baseline protective clause (listed under HARD RULES) the template lacks; where the template already covers a protection, keep the template's version.
- Always end with the baseline's ACKNOWLEDGMENT AND ACCEPTANCE section and signature block.

MONEY AND DATES:
- If the CUSTOM INSTRUCTIONS state a rate, fee, or payment window, include it verbatim in the fee/payment section. Never invent, estimate, or round a number that was not provided.
- Never extend a payment window beyond 30 days — US state freelance-hiring acts cap it.

HARD RULES — never break these:
- NEVER change the party names or the effective date.
- ALWAYS keep an "ACKNOWLEDGMENT AND ACCEPTANCE" closing and the PROVIDER / CONTRACTOR signature block (Name / Date lines) exactly as in the baseline.
- Keep these protections present and no weaker than the baseline: independent-contractor status (classification), the intellectual-property grant, third-party licence warranties, confidentiality, data protection, warranties, termination, liability and indemnity, and governing law.
- The IP clause is the most dangerous one to touch. If the baseline uses a present-tense assignment ("hereby irrevocably assigns"), keep that exact operative language — a bare "work made for hire" recital alone does not carry code or design work in the US. If the baseline grants German-style rights of use (Nutzungsrechte) instead of an assignment, keep it that way: copyright cannot be assigned under § 29 UrhG.
- Do not add a non-compete. A client non-solicitation clause is fine.
- Do not convert the German liability standard into a flat US-style cap: caps of that kind are void in German standard terms.
- Where the baseline puts a clause IN CAPITAL LETTERS, keep it in capital letters. Texas enforces liability limits only where they are conspicuous, so the capitals are load-bearing, not styling.

WHAT YOU MAY DO per the custom instructions:
- Adjust tone, voice, and phrasing.
- Add clauses/sections (equipment, exclusivity windows, credit, delivery specifics, kill fees).
- Reorder or retitle sections for clarity.
- Expand or clarify the scope of services.

OUTPUT:
- Return ONLY the final agreement text as plain text. No markdown, no code fences, no commentary, no preamble. Match the plain-text, "SECTION n. TITLE" formatting style of the baseline.`;

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

  return draftFromBaseline({
    baselineBody,
    system: SYSTEM_PROMPT,
    userContent: `CLIENT: ${clientName}${companyName ? ` / ${companyName}` : ""}

CUSTOM INSTRUCTIONS:
${customPrompt}

----- BASELINE CONTRACT (preserve all figures, parties, scope pricing, payment schedule, and signature block exactly) -----
${baselineBody}
----- END BASELINE -----

Produce the final tailored contract now. Plain text only.`,
  });
}

/**
 * Same drafting engine for agreements we send TO contractors — different system
 * prompt, and the baseline already carries the country-specific IP and liability
 * language that must survive.
 */
export async function generateAiContractorAgreementBody(opts: {
  baselineBody: string;
  customPrompt: string;
  contractorName: string;
  companyName: string | null;
  country: string | null;
  documentType: string;
}): Promise<{ body: string; usedAi: boolean; error?: string }> {
  const { baselineBody, customPrompt, contractorName, companyName, country, documentType } = opts;

  return draftFromBaseline({
    baselineBody,
    system: CONTRACTOR_SYSTEM_PROMPT,
    userContent: `DOCUMENT TYPE: ${documentType}
CONTRACTOR: ${contractorName}${companyName ? ` / ${companyName}` : ""}
CONTRACTOR COUNTRY: ${country || "not recorded"}

CUSTOM INSTRUCTIONS:
${customPrompt}

----- BASELINE AGREEMENT (preserve the parties, the effective date, the country-specific IP and liability language, and the signature block exactly) -----
${baselineBody}
----- END BASELINE -----

Produce the final tailored agreement now. Plain text only.`,
  });
}

async function draftFromBaseline(opts: {
  baselineBody: string;
  system: string;
  userContent: string;
}): Promise<{ body: string; usedAi: boolean; error?: string }> {
  const { baselineBody, system, userContent } = opts;

  if (!process.env.ANTHROPIC_API_KEY) {
    return { body: baselineBody, usedAi: false, error: "ANTHROPIC_API_KEY not set" };
  }

  try {
    const anthropic = new Anthropic();
    // Streamed: template-based prompts can be huge and the drafted contract long —
    // streaming avoids the SDK's non-streaming HTTP timeout at high max_tokens
    const stream = anthropic.messages.stream({
      model: CONTRACT_MODEL,
      max_tokens: 24000,
      system,
      messages: [{ role: "user", content: userContent }],
    });
    const message = await stream.finalMessage();

    // Never send a truncated contract — fall back to the baseline instead
    if (message.stop_reason === "max_tokens") {
      return { body: baselineBody, usedAi: false, error: "AI output hit the length limit — used baseline. Try a shorter template/instructions." };
    }

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
