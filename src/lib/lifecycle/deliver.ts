import { Resend } from "resend";
import { liveEmailsEnabled } from "./settings";

/**
 * The ONLY path through which lifecycle emails reach Resend. Every send is
 * gated on the `lifecycle_live_emails` master switch (default OFF), and
 * records flagged as dry-run never send regardless of the switch.
 */

const FROM_EMAIL = "Blok Blok Studio <chase@blokblokstudio.com>";

/** Fake/dry-run records use this domain so they can never receive real mail. */
export const DRY_RUN_EMAIL_DOMAIN = "@dryrun.local";

export function isDryRunAddress(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(DRY_RUN_EMAIL_DOMAIN);
}

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/** Plain-text template body → branded HTML matching the existing email style. */
export function renderEmailHtml(bodyText: string): string {
  const escaped = bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linked = escaped.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" style="color: #FF6B00; text-decoration: underline;">$1</a>'
  );
  const paragraphs = linked
    .split(/\n\n+/)
    .map((p) => `<p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">${p.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
  return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 32px;">
          <h2 style="color: #111; margin: 0;">Blok Blok Studio</h2>
          <p style="color: #666; font-size: 14px; margin: 4px 0 0 0;">creative tech studio</p>
        </div>
        ${paragraphs}
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #999; font-size: 12px;">
          Blok Blok Studio · chase@blokblokstudio.com
        </p>
      </div>
    `;
}

export interface DeliverResult {
  delivered: boolean; // true = actually handed to Resend
  dryRun: boolean;
  reason?: string;
}

/**
 * Send a lifecycle email if and only if live sends are enabled and the
 * recipient is not a dry-run record. Otherwise records a dry run.
 * `forceDry` lets callers (dry-run walker) hard-block delivery.
 */
export async function deliverLifecycleEmail(params: {
  to: string;
  subject: string;
  bodyText: string;
  forceDry?: boolean;
}): Promise<DeliverResult> {
  if (params.forceDry || isDryRunAddress(params.to)) {
    return { delivered: false, dryRun: true, reason: "dry-run record" };
  }
  if (!(await liveEmailsEnabled())) {
    return { delivered: false, dryRun: true, reason: "live emails master switch is off" };
  }
  const resend = getResend();
  if (!resend) {
    return { delivered: false, dryRun: true, reason: "RESEND_API_KEY not set" };
  }
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: params.subject,
    html: renderEmailHtml(params.bodyText),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return { delivered: true, dryRun: false };
}

/**
 * Test send: always allowed, but ONLY to the logged-in team member's own
 * address — used by the template editor's test button.
 */
export async function deliverTestEmail(params: {
  to: string;
  subject: string;
  bodyText: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) throw new Error("RESEND_API_KEY not set");
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: `[TEST] ${params.subject}`,
    html: renderEmailHtml(params.bodyText),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
