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
          Everything is set on our end! The final step is to fill out our onboarding form so we can get started on your project.
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

export async function sendContractSigningEmail(params: {
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
    subject: "Please Review & Sign Your Agreement — Blok Blok Studio",
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
          Thank you for your payment! Your service agreement is ready for review and signature. Please click the button below to review the terms and sign electronically.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${params.contractUrl}" style="display: inline-block; background-color: #FF6B00; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Review & Sign Agreement
          </a>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Once signed, you'll receive a confirmation email with a copy for your records.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          Blok Blok Studio · chase@blokblokstudio.com
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send contract signing email:", error);
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
    subject: "Your Signed Agreement — Blok Blok Studio",
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
          Thank you for completing your onboarding! Here's a copy of your signed service agreement for your records.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${params.contractUrl}" style="display: inline-block; background-color: #FF6B00; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            View Signed Agreement
          </a>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          We're excited to get started on your project. Our team will be in touch shortly!
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

/** Generic reminder email — used by the agent for pipeline follow-ups and admin reminders */
export async function sendReminderEmail(params: {
  to: string;
  subject: string;
  body: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set, skipping email");
    return null;
  }

  // Convert newlines to <br> for HTML
  const htmlBody = params.body.replace(/\n/g, "<br />");

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: params.subject,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h2 style="color: #111; margin: 0;">Blok Blok Studio</h2>
          <p style="color: #666; font-size: 14px; margin: 4px 0 0 0;">creative tech studio</p>
        </div>
        <div style="color: #333; font-size: 16px; line-height: 1.6;">
          ${htmlBody}
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          Blok Blok Studio · chase@blokblokstudio.com
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send reminder email:", error);
    return null;
  }

  return data;
}

/** Sent to the client immediately after they sign the contract */
export async function sendContractSignedClientEmail(params: {
  to: string;
  clientName: string;
  contractUrl: string;
  signedAt: Date;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set, skipping email");
    return null;
  }

  const dateFormatted = params.signedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: "Contract Signed — Blok Blok Studio",
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
          Your service agreement has been successfully signed and recorded. Here's a copy for your records.
        </p>
        <div style="background: #f9f9f9; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="color: #666; font-size: 13px; margin: 0 0 4px 0;">Signed on</p>
          <p style="color: #111; font-size: 15px; font-weight: 600; margin: 0;">${dateFormatted}</p>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${params.contractUrl}" style="display: inline-block; background-color: #FF6B00; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            View Signed Agreement
          </a>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          This link will remain accessible for your records. If you have any questions, feel free to reach out.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          Blok Blok Studio · chase@blokblokstudio.com
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send contract signed client email:", error);
    return null;
  }

  return data;
}

export async function sendPaymentReceivedEmail(params: {
  to: string;
  clientName: string;
  amount: string;
  description: string;
  currency: string;
  paidAt: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set, skipping email");
    return null;
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: "Payment Received — Blok Blok Studio",
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
          Thank you! We've received your payment. Here are the details:
        </p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #666; width: 120px;">Amount</td>
              <td style="padding: 8px 0; color: #111; font-weight: 600;">${params.amount}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Description</td>
              <td style="padding: 8px 0; color: #111;">${params.description}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Date</td>
              <td style="padding: 8px 0; color: #111;">${params.paidAt}</td>
            </tr>
          </table>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          If you have any questions about this payment, feel free to reach out.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          Blok Blok Studio · chase@blokblokstudio.com
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send payment received email:", error);
    return null;
  }

  return data;
}

export async function sendPaymentFailedEmail(params: {
  clientName: string;
  description: string;
  amount: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set, skipping email");
    return null;
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: "chase@blokblokstudio.com",
    subject: `Payment Failed — ${params.clientName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #111; margin: 0 0 24px 0;">Payment Failed</h2>
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #991b1b; font-size: 16px; font-weight: 600; margin: 0 0 4px 0;">
            Subscription payment failed for ${params.clientName}
          </p>
          <p style="color: #b91c1c; font-size: 14px; margin: 0;">
            ${params.description} — ${params.amount}
          </p>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Stripe will automatically retry the payment. Check the Stripe dashboard for more details.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send payment failed email:", error);
    return null;
  }

  return data;
}

export async function sendSubscriptionCancelledEmail(params: {
  clientName: string;
  description: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set, skipping email");
    return null;
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: "chase@blokblokstudio.com",
    subject: `Subscription Cancelled — ${params.clientName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #111; margin: 0 0 24px 0;">Subscription Cancelled</h2>
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #92400e; font-size: 16px; font-weight: 600; margin: 0 0 4px 0;">
            ${params.clientName}
          </p>
          <p style="color: #a16207; font-size: 14px; margin: 0;">
            ${params.description}
          </p>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          This subscription has been cancelled in Stripe. The payment link status has been updated to CANCELLED.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send subscription cancelled email:", error);
    return null;
  }

  return data;
}

export async function sendPaymentReminderEmail(params: {
  to: string;
  clientName: string;
  amount: string;
  description: string;
  paymentUrl: string;
  daysPending: number;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set, skipping email");
    return null;
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    subject: "Friendly Reminder — Payment Pending",
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
          Just a friendly reminder that you have a pending payment for <strong>${params.description}</strong>. It's been ${params.daysPending} days since we sent the payment link.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <p style="font-size: 28px; font-weight: bold; color: #111; margin: 0 0 8px 0;">${params.amount}</p>
          <a href="${params.paymentUrl}" style="display: inline-block; background-color: #FF6B00; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Pay Now
          </a>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          If you've already made this payment, please disregard this email. If you have any questions, feel free to reach out.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          Blok Blok Studio · chase@blokblokstudio.com
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send payment reminder email:", error);
    return null;
  }

  return data;
}

/** Sent to Chase when a client signs a contract */
export async function sendContractSignedAdminEmail(params: {
  clientName: string;
  company: string | null;
  signedName: string;
  contractUrl: string;
  signedAt: Date;
  ipAddress: string;
  documentHash?: string | null;
  signedDocumentHash?: string | null;
  providerSignedName?: string | null;
}) {
  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set, skipping email");
    return null;
  }

  const dateFormatted = params.signedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: "chase@blokblokstudio.com",
    subject: `Contract Signed — ${params.clientName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="color: #111; margin: 0 0 24px 0;">Contract Signed</h2>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #166534; font-size: 16px; font-weight: 600; margin: 0 0 4px 0;">
            ${params.clientName}${params.company ? ` (${params.company})` : ""} signed the contract
          </p>
          <p style="color: #15803d; font-size: 14px; margin: 0;">${dateFormatted}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #666; width: 120px;">Signed by</td>
            <td style="padding: 8px 0; color: #111; font-weight: 500;">${params.signedName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">IP Address</td>
            <td style="padding: 8px 0; color: #111; font-family: monospace;">${params.ipAddress}</td>
          </tr>
          ${params.providerSignedName ? `<tr>
            <td style="padding: 8px 0; color: #666;">Counter-signed</td>
            <td style="padding: 8px 0; color: #111; font-weight: 500;">${params.providerSignedName}</td>
          </tr>` : ""}
          ${params.documentHash ? `<tr>
            <td style="padding: 8px 0; color: #666;">Document Hash</td>
            <td style="padding: 8px 0; color: #111; font-family: monospace; font-size: 11px; word-break: break-all;">${params.documentHash}</td>
          </tr>` : ""}
          ${params.signedDocumentHash ? `<tr>
            <td style="padding: 8px 0; color: #666;">Signed Hash</td>
            <td style="padding: 8px 0; color: #111; font-family: monospace; font-size: 11px; word-break: break-all;">${params.signedDocumentHash}</td>
          </tr>` : ""}
        </table>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${params.contractUrl}" style="display: inline-block; background-color: #FF6B00; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            View Contract
          </a>
        </div>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send contract signed admin email:", error);
    return null;
  }

  return data;
}
