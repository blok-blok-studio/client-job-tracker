import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const FROM_EMAIL = "Blok Blok Studio <chase@blokblokstudio.com>";

export async function sendPaymentLinkEmail(params: {
  to: string;
  clientName: string;
  amount: string;
  description: string;
  paymentUrl: string;
  recurring?: boolean;
  interval?: string | null;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set, skipping email");
    return null;
  }

  const recurringText = params.recurring
    ? ` (${params.interval === "year" ? "annual" : "monthly"} subscription)`
    : "";

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: `Payment Link — ${params.description}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h2 style="color: #111; margin: 0;">Blok Blok Studio</h2>
          <p style="color: #666; font-size: 14px; margin: 4px 0 0 0;">creative tech studio</p>
        </div>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Hi ${params.clientName.split(" ")[0]},
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Here's your payment link for <strong>${params.description}</strong>${recurringText}:
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <p style="font-size: 28px; font-weight: bold; color: #111; margin: 0 0 8px 0;">${params.amount}</p>
          <a href="${params.paymentUrl}" style="display: inline-block; background-color: #FF6B00; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Pay Now
          </a>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          This is a secure payment link powered by Stripe. You can pay with card${params.recurring ? ", bank transfer, or set up automatic payments" : " or bank transfer"}.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          Blok Blok Studio · chase@blokblokstudio.com
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send payment link email:", error);
    return null;
  }

  return data;
}

export async function sendOnboardingLinkEmail(params: {
  to: string;
  clientName: string;
  onboardUrl: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set, skipping email");
    return null;
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: "Welcome to Blok Blok Studio — Let's Get Started",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h2 style="color: #111; margin: 0;">Blok Blok Studio</h2>
          <p style="color: #666; font-size: 14px; margin: 4px 0 0 0;">creative tech studio</p>
        </div>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Hi ${params.clientName.split(" ")[0]},
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Thank you for your payment! To get started, please fill out our onboarding form. This helps us set everything up for you.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${params.onboardUrl}" style="display: inline-block; background-color: #FF6B00; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Complete Onboarding
          </a>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          The form takes about 5 minutes and covers your business info, logins, and brand details so we can hit the ground running.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          Blok Blok Studio · chase@blokblokstudio.com
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send onboarding email:", error);
    return null;
  }

  return data;
}

export async function sendContractEmail(params: {
  to: string;
  clientName: string;
  contractUrl: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set, skipping email");
    return null;
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: "Your Service Agreement — Blok Blok Studio",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h2 style="color: #111; margin: 0;">Blok Blok Studio</h2>
          <p style="color: #666; font-size: 14px; margin: 4px 0 0 0;">creative tech studio</p>
        </div>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Hi ${params.clientName.split(" ")[0]},
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Thank you for completing your onboarding! The last step is to review and sign your service agreement.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${params.contractUrl}" style="display: inline-block; background-color: #FF6B00; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Review & Sign Contract
          </a>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Please review the agreement carefully. Once signed, we'll begin work right away.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          Blok Blok Studio · chase@blokblokstudio.com
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send contract email:", error);
    return null;
  }

  return data;
}
