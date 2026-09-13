import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Shared shell for the public legal pages platform reviewers and clients read. */
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-bb-black text-white">
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-12 sm:py-16">
        <Link href="/about" className="inline-block mb-10">
          <Image src="/bb_logo_wordmark_subhead_WHT_PNG.png" alt="Blok Blok Studio" width={140} height={48} priority />
        </Link>
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">{title}</h1>
        {updated ? <p className="text-sm text-bb-muted mb-10">Last updated {updated}</p> : <div className="mb-10" />}
        <div className="space-y-8 text-[15px] leading-relaxed text-gray-300 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-bb-orange [&_a]:underline">
          {children}
        </div>
        <nav className="mt-14 pt-6 border-t border-bb-border flex flex-wrap gap-x-6 gap-y-2 text-sm text-bb-muted">
          <Link href="/about" className="hover:text-white">About</Link>
          <Link href="/legal/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/legal/terms" className="hover:text-white">Terms of Service</Link>
          <Link href="/legal/data-deletion" className="hover:text-white">Data Deletion</Link>
          <a href="https://www.blokblokstudio.com" className="hover:text-white">blokblokstudio.com</a>
        </nav>
      </div>
    </main>
  );
}
