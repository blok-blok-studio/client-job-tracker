import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blok Blok Command Center",
  description: "AI-native operations platform for Blok Blok Studio",
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
