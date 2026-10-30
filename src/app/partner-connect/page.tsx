import type { Metadata } from "next";
import Image from "next/image";
import { shareMeta } from "@/lib/share-meta";

export const metadata: Metadata = shareMeta(
  "Stripe setup — Blok Blok Studio",
  "Commission payouts from Blok Blok Studio."
);

// Where a sales partner lands after Stripe's hosted Connect onboarding.
// Public and stateless: Stripe sends the partner here, not the owner.

const COPY: Record<string, { title: string; body: string }> = {
  done: {
    title: "You're set up for payouts",
    body: "Stripe has your details and payouts are enabled. Commissions from Blok Blok Studio will be transferred to the bank account you added, with a statement in your partner portal each time.",
  },
  pending: {
    title: "Almost there",
    body: "Stripe has your details and is finishing verification. You don't need to do anything else right now. If Stripe needs more information it will email you. Payouts start as soon as verification clears.",
  },
  expired: {
    title: "That link expired",
    body: "Stripe onboarding links only last a few minutes. Ask Chase for a fresh one and you can pick up where you left off.",
  },
};

export default async function PartnerConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const copy = COPY[state || "pending"] || COPY.pending;
  return (
    <main className="min-h-screen bg-bb-black text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-bb-surface border border-bb-border rounded-2xl p-8 text-center">
        <Image
          src="/bb_logo_wordmark_subhead_WHT_PNG.png"
          alt="Blok Blok Studio"
          width={240}
          height={129}
          className="h-14 w-auto mx-auto mb-6"
        />
        <h1 className="text-xl font-display font-bold mb-3">{copy.title}</h1>
        <p className="text-sm text-bb-muted leading-relaxed">{copy.body}</p>
        <p className="text-xs text-bb-dim mt-6">You can close this tab.</p>
      </div>
    </main>
  );
}
