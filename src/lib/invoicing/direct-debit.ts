import type Stripe from "stripe";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { InvoiceError, logInvoiceActivity, markPaid } from "./service";
import { appUrl } from "./view";
import { notifyUser } from "@/lib/notifications";

/**
 * Direct debit through Stripe: SEPA Lastschrift for EUR, ACH debit for USD.
 * The client signs the mandate on Stripe's page. We keep Stripe ids and the
 * last four digits; the account number stays at Stripe.
 *
 * Results are read by polling the PaymentIntent from the cron, because the
 * live webhook endpoint is not subscribed to payment_intent events. Debits
 * take days to settle, so a few hours of delay is harmless.
 */
/** Swappable so tests can never reach live Stripe. */
export const deps = { stripe: (): Stripe => getStripe() };

const TYPE_BY_CURRENCY: Record<string, "sepa_debit" | "us_bank_account"> = { EUR: "sepa_debit", USD: "us_bank_account" };

export function debitTypeFor(currency: string): "sepa_debit" | "us_bank_account" | null {
  return TYPE_BY_CURRENCY[currency.toUpperCase()] ?? null;
}

async function ensureCustomer(client: { id: string; name: string; email: string | null; stripeCustomerId: string | null }): Promise<string> {
  if (client.stripeCustomerId) return client.stripeCustomerId;
  const customer = await deps.stripe().customers.create({ name: client.name, email: client.email || undefined, metadata: { clientId: client.id } });
  await prisma.client.update({ where: { id: client.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/** Stripe-hosted mandate page, started from a client's invoice pay link. */
export async function startMandate(token: string): Promise<string> {
  const inv = await prisma.studioInvoice.findUnique({ where: { token }, select: { clientId: true, currency: true, status: true } });
  if (!inv || inv.status === "DRAFT") throw new InvoiceError("Not found", 404);
  const type = debitTypeFor(inv.currency);
  if (!type) throw new InvoiceError(`Direct debit is available for EUR and USD only, not ${inv.currency}.`, 422);
  const client = await prisma.client.findUnique({ where: { id: inv.clientId }, select: { id: true, name: true, email: true, stripeCustomerId: true } });
  if (!client) throw new InvoiceError("Not found", 404);
  const customer = await ensureCustomer(client);
  const session = await deps.stripe().checkout.sessions.create({
    mode: "setup",
    customer,
    payment_method_types: [type],
    currency: inv.currency.toLowerCase(),
    success_url: `${appUrl()}/api/invoice/${token}/debit/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/b/${token}`,
    metadata: { clientId: client.id, purpose: "invoice_direct_debit" },
  });
  if (!session.url) throw new InvoiceError("Stripe did not return a page", 502);
  return session.url;
}

/** Back from Stripe: the session is re-read from Stripe, never trusted from the URL alone. */
export async function finishMandate(token: string, sessionId: string): Promise<void> {
  const inv = await prisma.studioInvoice.findUnique({ where: { token }, select: { clientId: true, id: true } });
  if (!inv) throw new InvoiceError("Not found", 404);
  const session = await deps.stripe().checkout.sessions.retrieve(sessionId, { expand: ["setup_intent", "setup_intent.payment_method"] });
  if (session.metadata?.clientId !== inv.clientId || session.metadata?.purpose !== "invoice_direct_debit") throw new InvoiceError("Not found", 404);
  const setup = session.setup_intent as Stripe.SetupIntent | null;
  if (!setup || setup.status !== "succeeded") throw new InvoiceError("The mandate was not completed.", 409);
  const pm = setup.payment_method as Stripe.PaymentMethod;
  const last4 = pm.sepa_debit?.last4 ?? pm.us_bank_account?.last4 ?? null;
  await prisma.client.update({
    where: { id: inv.clientId },
    data: { debitPaymentMethodId: pm.id, debitType: pm.type, debitLast4: last4, debitMandateId: typeof setup.mandate === "string" ? setup.mandate : (setup.mandate?.id ?? null), debitConsentAt: new Date() },
  });
  await logInvoiceActivity({ clientId: inv.clientId, actor: "client", action: "debit_mandate_signed", details: `Direct debit mandate signed (${pm.type}, ending ${last4})` });
  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  for (const o of owners) await notifyUser({ userId: o.id, type: "approval_response", title: "Direct debit mandate signed", body: `Account ending ${last4}. Recurring plans set to direct debit can now collect automatically.`, link: "/invoices?tab=plans", clientId: inv.clientId }).catch(() => {});
}

export async function removeMandate(clientId: string, actor: string): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { debitPaymentMethodId: true } });
  if (client?.debitPaymentMethodId) await deps.stripe().paymentMethods.detach(client.debitPaymentMethodId);
  await prisma.client.update({ where: { id: clientId }, data: { debitPaymentMethodId: null, debitType: null, debitLast4: null, debitMandateId: null, debitConsentAt: null } });
  await logInvoiceActivity({ clientId, actor, action: "debit_mandate_removed", details: "Direct debit mandate removed" });
}

const ZERO_DECIMAL = new Set<string>();

/** Collect one issued invoice. Idempotent on the invoice id, so a retry cannot double charge. */
export async function chargeInvoice(invoiceId: string, actor: string): Promise<{ status: string }> {
  const inv = await prisma.studioInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new InvoiceError("Invoice not found", 404);
  if (inv.status !== "ISSUED" && inv.status !== "SENT") throw new InvoiceError("Only open invoices can be collected.", 409);
  if (inv.kind !== "INVOICE") throw new InvoiceError("Corrections are not collected.", 409);
  if (inv.debitStatus === "PROCESSING" || inv.debitStatus === "SUCCEEDED") return { status: inv.debitStatus };
  const client = await prisma.client.findUnique({ where: { id: inv.clientId }, select: { stripeCustomerId: true, debitPaymentMethodId: true, debitType: true } });
  if (!client?.debitPaymentMethodId || !client.stripeCustomerId) throw new InvoiceError("This client has no direct debit mandate.", 422);
  const expected = debitTypeFor(inv.currency);
  if (client.debitType !== expected) throw new InvoiceError(`The mandate is ${client.debitType}, this invoice is ${inv.currency}.`, 422);
  const attempt = (await prisma.activityLog.count({ where: { clientId: inv.clientId, action: "debit_failed", details: { contains: inv.number || inv.id } } })) + 1;
  const amount = ZERO_DECIMAL.has(inv.currency) ? Math.round(Number(inv.total)) : Math.round(Number(inv.total) * 100);
  const intent = await deps.stripe().paymentIntents.create(
    {
      amount,
      currency: inv.currency.toLowerCase(),
      customer: client.stripeCustomerId,
      payment_method: client.debitPaymentMethodId,
      payment_method_types: [client.debitType as string],
      off_session: true,
      confirm: true,
      description: `Invoice ${inv.number}`,
      statement_descriptor_suffix: undefined,
      metadata: { studioInvoiceId: inv.id, number: inv.number || "" },
    },
    { idempotencyKey: `studio_invoice_${inv.id}_${attempt}` }
  );
  await prisma.studioInvoice.update({ where: { id: inv.id }, data: { debitIntentId: intent.id, debitStatus: "PROCESSING", debitError: null } });
  await logInvoiceActivity({ clientId: inv.clientId, actor, action: "debit_started", details: `Direct debit started for ${inv.number}` });
  return { status: "PROCESSING" };
}

/** Cron: read every debit in flight from Stripe. */
export async function pollDebits(): Promise<Array<{ number: string | null; status: string }>> {
  const open = await prisma.studioInvoice.findMany({ where: { debitStatus: "PROCESSING", debitIntentId: { not: null } }, take: 100 });
  const out: Array<{ number: string | null; status: string }> = [];
  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  for (const inv of open) {
    const pi = await deps.stripe().paymentIntents.retrieve(inv.debitIntentId!, { expand: ["latest_charge"] });
    if (pi.status === "succeeded") {
      await prisma.studioInvoice.update({ where: { id: inv.id }, data: { debitStatus: "SUCCEEDED" } });
      await markPaid(inv.id, "direct debit", { paidAt: new Date().toISOString().slice(0, 10), method: "direct_debit", note: `Stripe ${pi.id}` });
      out.push({ number: inv.number, status: "SUCCEEDED" });
    } else if (pi.status === "requires_payment_method" || pi.status === "canceled") {
      const why = pi.last_payment_error?.message || (pi.status === "canceled" ? "canceled" : "debit failed");
      await prisma.studioInvoice.update({ where: { id: inv.id }, data: { debitStatus: "FAILED", debitError: why.slice(0, 300) } });
      await logInvoiceActivity({ clientId: inv.clientId, actor: "system", action: "debit_failed", details: `Direct debit for ${inv.number || inv.id} failed: ${why}` });
      for (const o of owners) await notifyUser({ userId: o.id, type: "connection_problem", title: `Direct debit failed for ${inv.number}`, body: why, link: `/invoices?invoice=${inv.id}`, clientId: inv.clientId }).catch(() => {});
      out.push({ number: inv.number, status: "FAILED" });
    }
  }
  return out;
}
