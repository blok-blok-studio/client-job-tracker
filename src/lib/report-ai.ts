import Anthropic from "@anthropic-ai/sdk";

// Claude Opus 4.8 — most capable generally-recommended model for analysis + writing
const REPORT_MODEL = "claude-opus-4-8";

export interface GeneratedReport {
  metrics: Array<{ label: string; value: string; change?: string | null }>;
  highlights: string[];
  summary: string[];
  recommendations: string[];
}

const SYSTEM_PROMPT = `You are a senior social media analyst at Blok Blok Studio, a creative tech agency. You turn raw platform analytics exports (Instagram/Facebook/TikTok/LinkedIn CSVs, Meta Business Suite exports, or copied dashboard stats) into polished monthly performance reports that get sent directly to the agency's clients.

Rules:
- Write for the CLIENT (a business owner, not a marketer). Warm, professional, plain language. No platform jargon without a one-phrase explanation.
- Only state numbers that appear in (or are directly computable from) the provided data. Never invent metrics. If the data is thin, say less rather than padding.
- If prior-period numbers are present, compute changes and frame them honestly — including declines, with context.
- Respond with ONLY a JSON object, no markdown fences, matching exactly:
{
  "metrics": [{"label": "Followers", "value": "4,210", "change": "+6.2%"}],   // 4-8 headline stats; change null if unknown
  "highlights": ["..."],                                                      // 3-5 wins/notables, one sentence each
  "summary": ["..."],                                                         // 2-4 short paragraphs: the month's story
  "recommendations": ["..."]                                                  // 2-4 concrete next-month suggestions
}`;

export async function generateClientReport(opts: {
  clientName: string;
  company: string | null;
  month: string; // "2026-07"
  rawData: string;
  notes?: string | null;
}): Promise<{ report: GeneratedReport | null; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { report: null, error: "ANTHROPIC_API_KEY not set" };
  }

  const monthLabel = new Date(`${opts.month}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: REPORT_MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `CLIENT: ${opts.clientName}${opts.company ? ` (${opts.company})` : ""}
REPORTING PERIOD: ${monthLabel}
${opts.notes ? `AGENCY NOTES (context from the account manager, weave in where relevant):\n${opts.notes}\n` : ""}
----- RAW ANALYTICS DATA -----
${opts.rawData.slice(0, 60000)}
----- END DATA -----

Produce the monthly report JSON now.`,
        },
      ],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    // Extract the JSON object (tolerate stray prose or fences)
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON in model output");
    const parsed = JSON.parse(text.slice(start, end + 1)) as GeneratedReport;

    if (!Array.isArray(parsed.metrics) || !Array.isArray(parsed.summary)) {
      throw new Error("Malformed report structure");
    }

    return { report: parsed };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Report generation failed";
    console.error("[Report AI]", msg);
    return { report: null, error: msg };
  }
}
