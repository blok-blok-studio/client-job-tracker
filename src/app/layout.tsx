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
        {/* Inline script runs immediately before React hydration — blocks browser
            from opening files in new tabs on drag-and-drop. Must be here (not in
            a useEffect) to beat the browser's built-in handler on all browsers
            including Vivaldi, Brave, Arc, etc. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.addEventListener('dragover', function(e) { e.preventDefault(); }, false);
              document.addEventListener('drop', function(e) { e.preventDefault(); }, false);
              window.addEventListener('dragover', function(e) { e.preventDefault(); }, false);
              window.addEventListener('drop', function(e) { e.preventDefault(); }, false);
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
