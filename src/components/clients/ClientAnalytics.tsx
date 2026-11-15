"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MousePointerClick, ArrowRight } from "lucide-react";

interface Site {
  id: string;
  name: string;
  domain: string;
  active: boolean;
  clientId: string | null;
  visitors7d: number;
}

/** Client page card: this client's tracked websites, each opening its numbers in the Analytics tab. */
export default function ClientAnalytics({ clientId }: { clientId: string }) {
  const [sites, setSites] = useState<Site[] | null>(null);

  useEffect(() => {
    fetch("/api/analytics/sites")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSites(d?.success ? (d.data as Site[]).filter((s) => s.clientId === clientId) : []))
      .catch(() => setSites([]));
  }, [clientId]);

  // Nothing tracked for this client: stay out of the way
  if (!sites || sites.length === 0) return null;

  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <MousePointerClick size={16} className="text-bb-accent" /> Website analytics
        </h3>
      </div>
      <div className="space-y-2">
        {sites.map((s) => (
          <Link
            key={s.id}
            href={`/analytics?site=${s.id}`}
            className="flex items-center justify-between gap-2 p-2 rounded hover:bg-bb-elevated"
          >
            <span className="min-w-0">
              <span className="block text-sm text-white truncate">{s.domain}</span>
              <span className="block text-xs text-bb-dim">
                {s.active ? `${s.visitors7d.toLocaleString()} ${s.visitors7d === 1 ? "visitor" : "visitors"} in the last 7 days` : "Tracking paused"}
              </span>
            </span>
            <ArrowRight size={14} className="text-bb-dim shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
