import type { Metadata } from "next";

// Metadata for public token links (contract, review, onboard, upload).
// Link previews in iMessage/Slack/WhatsApp read these tags; keep them
// client-facing (no internal branding) and noindex so tokens stay out of search.
export function shareMeta(title: string, description: string): Metadata {
  return {
    title: `${title} · Blok Blok Studio`,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      siteName: "Blok Blok Studio",
      title,
      description,
      images: [{ url: "/og-card.png", width: 1200, height: 630, alt: "Blok Blok Studio" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-card.png"],
    },
  };
}
