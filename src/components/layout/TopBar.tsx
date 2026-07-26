"use client";

import { Bell, Search } from "lucide-react";

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  return (
    <div className="flex items-center justify-between pl-14 lg:pl-6 pr-4 lg:pr-6 py-4">
      <div>
        <h1 className="text-xl font-display font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-bb-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("bb-open-search"))}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bb-elevated text-bb-muted hover:text-white transition-colors"
          title="Search everything (⌘K)"
        >
          <Search size={18} />
          <kbd className="hidden md:block text-[10px] text-bb-dim bg-bb-elevated border border-bb-border rounded px-1.5 py-0.5">⌘K</kbd>
        </button>
        <button className="p-2 rounded-lg hover:bg-bb-elevated text-bb-muted hover:text-white transition-colors relative">
          <Bell size={20} />
        </button>
      </div>
    </div>
  );
}
