"use client";

import Link from "next/link";
import { MoreVertical, Calendar, CheckSquare } from "lucide-react";
import Badge from "@/components/shared/Badge";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";

interface ClientCardProps {
  id: string;
  name: string;
  company: string | null;
  tier: string;
  type: string;
  monthlyRetainer: number | null;
  contractEnd: string | null;
  openTaskCount: number;
  onArchive: (id: string) => void;
}

const tierVariant: Record<string, "orange" | "gray" | "blue"> = {
  VIP: "orange",
  STANDARD: "gray",
  TRIAL: "blue",
};

export default function ClientCard({
  id,
  name,
  company,
  tier,
  monthlyRetainer,
  contractEnd,
  openTaskCount,
  onArchive,
}: ClientCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const daysUntilExpiry = contractEnd
    ? Math.ceil((new Date(contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const expiringSoon = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30;

  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg p-5 hover:border-bb-orange/30 transition-colors relative">
      <div className="flex items-start justify-between mb-3">
        <Link href={`/clients/${id}`} className="group">
          <h3 className="font-display font-semibold text-white group-hover:text-bb-orange transition-colors">
            {name}
          </h3>
          {company && <p className="text-sm text-bb-muted">{company}</p>}
        </Link>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 rounded hover:bg-bb-elevated text-bb-dim"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 bg-bb-elevated border border-bb-border rounded-lg shadow-modal py-1 z-20 w-32">
                <Link
                  href={`/clients/${id}`}
                  className="block px-3 py-1.5 text-sm text-bb-muted hover:text-white hover:bg-bb-surface"
                >
                  View Details
                </Link>
                <button
                  onClick={() => { onArchive(id); setMenuOpen(false); }}
                  className="block w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-bb-surface"
                >
                  Archive
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Badge variant={tierVariant[tier] || "gray"}>{tier}</Badge>
        {expiringSoon && <Badge variant="yellow">Expiring soon</Badge>}
      </div>

      <div className="space-y-2 text-sm">
        {monthlyRetainer && (
          <div className="flex items-center justify-between">
            <span className="text-bb-dim">Retainer</span>
            <span className="text-bb-muted font-mono">{formatCurrency(monthlyRetainer)}</span>
          </div>
        )}
        {contractEnd && (
          <div className="flex items-center justify-between">
            <span className="text-bb-dim flex items-center gap-1">
              <Calendar size={12} /> Ends
            </span>
            <span className={`font-mono ${expiringSoon ? "text-yellow-400" : "text-bb-dim"}`}>
              {new Date(contractEnd).toLocaleDateString()}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-bb-dim flex items-center gap-1">
            <CheckSquare size={12} /> Open Tasks
          </span>
          <span className="text-bb-muted font-mono">{openTaskCount}</span>
        </div>
      </div>
    </div>
  );
}
