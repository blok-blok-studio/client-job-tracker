import { SERVICE_PACKAGES, type ServicePackage } from "@/lib/contract-templates";

/**
 * The catalog sales partners sell from.
 *
 * Partner reps never see the full package list — only this locked US price
 * list, which is exactly what the partnership deck promised. The packages
 * themselves live in SERVICE_PACKAGES (category "partner-us") so contract
 * generation, PDF rendering and Stripe Checkout need no special casing; this
 * file just groups them and says which commission pillar each one belongs to.
 */

export type CommissionPillar = "PROJECT" | "BRAND_GUIDE" | "PLAN";

export const PARTNER_WEBSITE_IDS = ["partner-website-5", "partner-website-10", "partner-website-15"] as const;
export const PARTNER_BRAND_GUIDE_ID = "partner-brand-guide" as const;
export const PARTNER_PLAN_IDS = ["partner-plan-base", "partner-plan-growth", "partner-plan-premium"] as const;

export const PARTNER_PACKAGE_IDS: readonly string[] = [
  ...PARTNER_WEBSITE_IDS,
  PARTNER_BRAND_GUIDE_ID,
  ...PARTNER_PLAN_IDS,
];

export function isPartnerPackage(id: string): boolean {
  return PARTNER_PACKAGE_IDS.includes(id);
}

export function partnerPackage(id: string): ServicePackage | undefined {
  return SERVICE_PACKAGES.find((p) => p.id === id && p.category === "partner-us");
}

export function partnerPackages(): ServicePackage[] {
  return PARTNER_PACKAGE_IDS.map((id) => partnerPackage(id)).filter((p): p is ServicePackage => !!p);
}

/** Which commission pillar a package's revenue falls under. */
export function commissionPillarFor(packageId: string): CommissionPillar | null {
  if ((PARTNER_WEBSITE_IDS as readonly string[]).includes(packageId)) return "PROJECT";
  if (packageId === PARTNER_BRAND_GUIDE_ID) return "BRAND_GUIDE";
  if ((PARTNER_PLAN_IDS as readonly string[]).includes(packageId)) return "PLAN";
  // Anything outside the partner catalog that a partner-attributed client
  // buys (an owner-built custom contract, say) counts as project revenue.
  return "PROJECT";
}

/** Payment terms every partner-generated contract uses. Not editable by reps. */
export const PARTNER_PAYMENT_SCHEDULE = [
  { label: "deposit", percent: 50 },
  { label: "completion", percent: 50 },
] as const;

/** Terms appended to every partner-generated service agreement. */
export const PARTNER_CONTRACT_TERMS = `Third-party usage fees (hosting beyond what is included, domain registration, telephony, SMS, AI minutes, ad spend and similar pass-through costs) are billed directly to the Client's own accounts and are not included in the fees above. Where such an account is required it is created in the Client's name with the Client's payment method; the Provider keeps administrative access for the duration of the engagement.

This Agreement was presented by an authorized sales partner of the Provider. The sales partner is not a party to this Agreement, has no authority to vary its terms, and all payments are made to Blok Blok Studio LLC only.`;

/** What a rep sees for each package in the portal and the kit. */
export function catalogSummary() {
  return partnerPackages().map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    recurring: !!p.recurring,
    description: p.description,
    deliverables: p.deliverables,
    timeline: p.timeline,
    pillar: commissionPillarFor(p.id),
  }));
}
