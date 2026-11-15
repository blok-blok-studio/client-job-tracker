import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Website analytics",
  description: "Visitors, pages and sources for your website.",
  robots: { index: false, follow: false },
};

export default function SharedStatsLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-bb-black text-white pt-4">{children}</main>;
}
