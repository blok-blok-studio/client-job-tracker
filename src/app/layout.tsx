import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app"),
  title: "Blok Blok Command Center",
  description: "Operations platform for Blok Blok Studio.",
  openGraph: {
    siteName: "Blok Blok Studio",
    title: "Blok Blok Studio",
    description: "Creative tech studio.",
    images: [{ url: "/og-card.png", width: 1200, height: 630, alt: "Blok Blok Studio" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blok Blok Studio",
    description: "Creative tech studio.",
    images: ["/og-card.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BlokBlok",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bb-black text-white font-body antialiased">
        {children}
      </body>
    </html>
  );
}
