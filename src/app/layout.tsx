import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blok Blok Command Center",
  description: "AI-native operations platform for Blok Blok Studio",
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
