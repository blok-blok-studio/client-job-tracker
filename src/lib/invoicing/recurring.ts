import prisma from "@/lib/prisma";
import type { Prisma, RecurringPlan } from "@prisma/client";
import { z } from "zod";
import { createDraft, issueInvoice, sendIssuedInvoice, InvoiceError, lineItemSchema, logInvoiceActivity } from "./service";
import { loadInvoiceSettings, missingBankFields } from "./settings";
import { notifyUser } from "@/lib/notifications";
import { notifySlack } from "@/lib/slack";

/**
 * Recurring plans: Stripe-style monthly billing by bank transfer. The cron
 * issues a real numbered invoice on the plan's day, emails it (GiroCode / Wise
 * details), and the client pays each month. Nothing about how they pay is
 * stored. Quarterly and yearly work the same way.
 */
export const planSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  interval: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  dayOfMonth: z.number().int().min(1).max(28).default(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  template: z.enum(["DE", "US", "EU"]).default("US"),
  language: z.enum(["de", "en"]).default("en"),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("EUR"),
  vatOverride: z.enum(["AUTO", "KLEINUNTERNEHMER", "REGULAR", "REVERSE_CHARGE", "DRITTLAND"]).nullable().optional(),
  dueDays: z.number().int().min(0).max(90).default(14),
  items: z.array(lineItemSchema).min(1).max(50),
  notes: z.string().max(2000).nullable().optional(),
  autoSend: z.boolean().default(true),
  paymentMethod: z.enum(["BANK", "STRIPE", "DIRECT_DEBIT"]).default("BANK"),
  paymentUrl: z.string().trim().url().regex(/^https:\/\//).max(500).nullable().optional().or(z.literal("")),
});
export type PlanInput = z.infer<typeof planSchema>;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.blokblokstudio.com";

function dateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** First run on/after `from` that falls on dayOfMonth. */
export function firstRunAt(from: Date, dayOfMonth: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const candidate = new Date(Date.UTC(y, m, dayOfMonth));
  return candidate >= from ? candidate : new Date(Date.UTC(y, m + 1, dayOfMonth));
}

export function advanceRun(current: Date, interval: string, dayOfMonth: number): Date {
  const months = interval === "YEARLY" ? 12 : interval === "QUARTERLY" ? 3 : 1;
  return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + months, dayOfMonth));
}

/** "{month}" / "{year}" / "{period}" in item descriptions become the billing period of the run. */
export function fillPeriod(text: string, runAt: Date, interval: string, language: string): string {
  const locale = language === "de" ? "de-DE" : "en-US";
  const month = runAt.toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const year = String(runAt.getUTCFullYear());
  let period = month;
  if (interval === "QUARTERLY") period = `Q${Math.floor(runAt.getUTCMonth() / 3) + 1} ${year}`;
  if (interval === "YEARLY") period = year;
  return text.replace(/\{month\}/gi, month).replace(/\{year\}/gi, year).replace(/\{period\}/gi, period);
}

export async function createPlan(input: PlanInput, actor: string): Promise<RecurringPlan> {
  const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true, name: true } });
  if (!client) throw new InvoiceError("Client not found", 404);
  const start = dateOnly(input.startDate);
  const plan = await prisma.recurringPlan.create({
    data: {
      clientId: client.id,
      name: input.name,
      interval: input.interval,
      dayOfMonth: input.dayOfMonth,
      startDate: start,
      endDate: input.endDate ? dateOnly(input.endDate) : null,
      nextRunAt: firstRunAt(start, input.dayOfMonth),
      template: input.template,
      language: input.language,
      currency: input.currency,
      vatOverride: input.vatOverride && input.vatOverride !== "AUTO" ? input.vatOverride : null,
      dueDays: input.dueDays,
      items: input.items as unknown as Prisma.InputJsonValue,
      notes: input.notes || null,
      autoSend: input.autoSend,
      paymentMethod: input.paymentMethod,
      paymentUrl: input.paymentMethod === "STRIPE" ? input.paymentUrl || null : null,
      createdBy: actor,
    },
  });
  await logInvoiceActivity({ clientId: client.id, actor, action: "invoice_plan_created", details: `Recurring plan "${plan.name}" (${plan.interval.toLowerCase()}, day ${plan.dayOfMonth}) created` });
  return plan;
}

export async function updatePlan(id: string, input: Partial<PlanInput> & { status?: "ACTIVE" | "PAUSED" | "ENDED" }, actor: string): Promise<RecurringPlan> {
  const existing = await prisma.recurringPlan.findUnique({ where: { id } });
  if (!existing) throw new InvoiceError("Plan not found", 404);
  const dayOfMonth = input.dayOfMonth ?? existing.dayOfMonth;
  const interval = input.interval ?? existing.interval;
  let nextRunAt = existing.nextRunAt;
  if (input.startDate) nextRunAt = firstRunAt(dateOnly(input.startDate), dayOfMonth);
  else if (input.dayOfMonth !== undefined && input.dayOfMonth !== existing.dayOfMonth) nextRunAt = firstRunAt(new Date(), dayOfMonth);
  const plan = await prisma.recurringPlan.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.interval !== undefined ? { interval } : {}),
      ...(input.dayOfMonth !== undefined ? { dayOfMonth } : {}),
      ...(input.startDate !== undefined ? { startDate: dateOnly(input.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate ? dateOnly(input.endDate) : null } : {}),
      nextRunAt,
      ...(input.template !== undefined ? { template: input.template } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.vatOverride !== undefined ? { vatOverride: input.vatOverride && input.vatOverride !== "AUTO" ? input.vatOverride : null } : {}),
      ...(input.dueDays !== undefined ? { dueDays: input.dueDays } : {}),
      ...(input.items !== undefined ? { items: input.items as unknown as Prisma.InputJsonValue } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.autoSend !== undefined ? { autoSend: input.autoSend } : {}),
      ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod, paymentUrl: input.paymentMethod === "STRIPE" ? input.paymentUrl || existing.paymentUrl : null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
  await logInvoiceActivity({ clientId: plan.clientId, actor, action: "invoice_plan_updated", details: `Recurring plan "${plan.name}" updated${input.status ? ` (${input.status.toLowerCase()})` : ""}` });
  return plan;
}

/** One billing run: draft → issue → (auto)send. Returns the invoice id or the reason it was skipped. */
export async function runPlanOnce(plan: RecurringPlan, runAt: Date, actor: string): Promise<{ invoiceId: string | null; number: string | null; skipped?: string; sent?: boolean }> {
  const settings = await loadInvoiceSettings();
  if (plan.paymentMethod !== "STRIPE" && missingBankFields(settings, plan.currency).length) {
    return { invoiceId: null, number: null, skipped: `${plan.currency} bank details missing` };
  }
  const items = (plan.items as unknown as Array<{ description: string; qty: number; unitPrice: number }>).map((i) => ({
    description: fillPeriod(i.description, runAt, plan.interval, plan.language),
    qty: Number(i.qty),
    unitPrice: Number(i.unitPrice),
  }));
  const { invoice } = await createDraft(
    {
      clientId: plan.clientId,
      template: plan.template as "DE" | "US" | "EU",
      language: plan.language as "de" | "en",
      currency: plan.currency,
      issueDate: runAt.toISOString().slice(0, 10),
      dueDays: plan.dueDays,
      items,
      notes: plan.notes ? fillPeriod(plan.notes, runAt, plan.interval, plan.language) : null,
      internalNote: `Recurring plan "${plan.name}" (${plan.interval.toLowerCase()})`,
      vatOverride: (plan.vatOverride as "KLEINUNTERNEHMER" | "REGULAR" | "REVERSE_CHARGE" | "DRITTLAND" | null) ?? "AUTO",
      paymentMethod: plan.paymentMethod === "STRIPE" ? "STRIPE" : "BANK",
      paymentUrl: plan.paymentUrl || "",
      serviceDateFrom: runAt.toISOString().slice(0, 10),
      serviceDateTo: new Date(advanceRun(runAt, plan.interval, plan.dayOfMonth).getTime() - 86_400_000).toISOString().slice(0, 10),
    },
    actor
  );
  await prisma.studioInvoice.update({ where: { id: invoice.id }, data: { planId: plan.id } });
  const issued = await issueInvoice(invoice.id, actor);
  let sent = false;
  if (plan.autoSend && settings.autoSendOnIssue !== false) {
    const r = await sendIssuedInvoice(invoice.id, actor);
    sent = r.sent;
  }
  // Mandate on file: collect now. A failure leaves a normal open invoice the client can pay by transfer.
  if (plan.paymentMethod === "DIRECT_DEBIT") {
    const { chargeInvoice } = await import("./direct-debit");
    await chargeInvoice(invoice.id, actor).catch(async (err) => {
      await logInvoiceActivity({ clientId: plan.clientId, actor, action: "debit_failed", details: `Direct debit for ${issued.number} could not start: ${err instanceof Error ? err.message : "unknown"}` });
    });
  }
  return { invoiceId: invoice.id, number: issued.number, sent };
}

/** Cron entry: every ACTIVE plan whose nextRunAt has passed gets its invoice. One run per call per plan (catch-up is deliberate, one at a time). */
export async function runDueRecurringPlans(now = new Date()): Promise<Array<{ planId: string; name: string; number: string | null; skipped?: string }>> {
  const due = await prisma.recurringPlan.findMany({ where: { status: "ACTIVE", nextRunAt: { lte: now } }, orderBy: { nextRunAt: "asc" }, take: 50 });
  const out: Array<{ planId: string; name: string; number: string | null; skipped?: string }> = [];
  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  for (const plan of due) {
    if (plan.endDate && plan.nextRunAt > plan.endDate) {
      await prisma.recurringPlan.update({ where: { id: plan.id }, data: { status: "ENDED" } });
      continue;
    }
    try {
      const r = await runPlanOnce(plan, plan.nextRunAt, "system");
      if (r.skipped) {
        out.push({ planId: plan.id, name: plan.name, number: null, skipped: r.skipped });
        for (const o of owners) await notifyUser({ userId: o.id, type: "connection_problem", title: `Recurring invoice skipped: ${plan.name}`, body: r.skipped, link: "/invoices?tab=plans" }).catch(() => {});
        continue; // stays due; retried next cron once fixed
      }
      await prisma.recurringPlan.update({
        where: { id: plan.id },
        data: { lastRunAt: now, runs: { increment: 1 }, nextRunAt: advanceRun(plan.nextRunAt, plan.interval, plan.dayOfMonth) },
      });
      out.push({ planId: plan.id, name: plan.name, number: r.number });
      await notifySlack(`:repeat: Recurring invoice *${r.number}* issued for plan *${plan.name}*${r.sent ? " and emailed" : ""}.\n${APP_URL}/invoices?invoice=${r.invoiceId}`).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "failed";
      console.error("[recurring] plan run failed:", plan.id, msg);
      out.push({ planId: plan.id, name: plan.name, number: null, skipped: msg });
      for (const o of owners) await notifyUser({ userId: o.id, type: "connection_problem", title: `Recurring invoice failed: ${plan.name}`, body: msg, link: "/invoices?tab=plans" }).catch(() => {});
    }
  }
  return out;
}
