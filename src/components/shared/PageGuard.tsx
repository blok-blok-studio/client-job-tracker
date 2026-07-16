"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// Redirects members away from tabs the owner hasn't granted them.
// An empty allowedPages list means full access; owners always have access.
// (UI-level enforcement for an internal tool — the sidebar also hides
// non-granted tabs, this catches direct URLs.)
export default function PageGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<{ role: string; allowedPages: string[] } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.user && setMe({ role: d.user.role, allowedPages: d.user.allowedPages || [] }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!me || me.role === "OWNER" || me.allowedPages.length === 0) return;
    const segment = pathname.split("/")[1];
    // Dashboard home, clients detail under /clients, and team (owner-gated
    // separately) are handled by their own keys
    if (!segment || segment === "team") return;
    if (!me.allowedPages.includes(segment)) {
      router.replace("/");
    }
  }, [me, pathname, router]);

  return null;
}
