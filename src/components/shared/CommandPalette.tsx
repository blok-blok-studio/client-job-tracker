"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Users, ClipboardList, FileText, Loader2, CornerDownLeft,
  LayoutDashboard, Columns3, CalendarDays, PenSquare, FolderOpen, Receipt,
} from "lucide-react";

interface Results {
  clients: Array<{ id: string; name: string; company: string | null; type: string }>;
  tasks: Array<{ id: string; title: string; status: string; client: { name: string } | null }>;
  files: Array<{ id: string; filename: string; fileType: string; client: { name: string } | null }>;
}

const EMPTY: Results = { clients: [], tasks: [], files: [] };

const QUICK_NAV = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Kanban Board", href: "/kanban", icon: Columns3 },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Content", href: "/content", icon: PenSquare },
  { label: "Files", href: "/files", icon: FolderOpen },
  { label: "Invoices", href: "/invoices", icon: Receipt },
];

interface Item {
  key: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  href: string;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ⌘K / Ctrl+K to open, Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(EMPTY);
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (data.success) setResults(data.data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 250);
  }, [query]);

  const items = useMemo<Item[]>(() => {
    if (query.trim().length < 2) {
      return QUICK_NAV.filter((n) => !query || n.label.toLowerCase().includes(query.toLowerCase())).map((n) => ({
        key: `nav-${n.href}`,
        icon: <n.icon size={15} className="text-bb-dim" />,
        title: n.label,
        href: n.href,
      }));
    }
    return [
      ...results.clients.map((c) => ({
        key: `client-${c.id}`,
        icon: <Users size={15} className="text-bb-orange" />,
        title: c.name,
        subtitle: c.company || c.type.toLowerCase(),
        href: `/clients/${c.id}`,
      })),
      ...results.tasks.map((t) => ({
        key: `task-${t.id}`,
        icon: <ClipboardList size={15} className="text-blue-400" />,
        title: t.title,
        subtitle: `${t.status.replace(/_/g, " ").toLowerCase()}${t.client ? ` · ${t.client.name}` : ""}`,
        href: `/kanban?task=${t.id}`,
      })),
      ...results.files.map((f) => ({
        key: `file-${f.id}`,
        icon: <FileText size={15} className="text-purple-400" />,
        title: f.filename,
        subtitle: `${f.fileType.toLowerCase()}${f.client ? ` · ${f.client.name}` : ""}`,
        href: `/files?search=${encodeURIComponent(f.filename)}`,
      })),
    ];
  }, [query, results]);

  useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(0, items.length - 1)));
  }, [items]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-bb-surface border border-bb-border rounded-xl shadow-modal overflow-hidden animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-bb-border">
          {loading ? (
            <Loader2 size={16} className="text-bb-dim animate-spin shrink-0" />
          ) : (
            <Search size={16} className="text-bb-dim shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter" && items[highlight]) {
                go(items[highlight].href);
              }
            }}
            placeholder="Search clients, tasks, files…"
            className="flex-1 bg-transparent py-3.5 text-sm text-white placeholder:text-bb-dim focus:outline-none"
          />
          <kbd className="hidden sm:block text-[10px] text-bb-dim bg-bb-elevated border border-bb-border rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {items.length === 0 && !loading && (
            <p className="text-center text-xs text-bb-dim py-8">
              {query.trim().length < 2 ? "Type to search…" : "No matches"}
            </p>
          )}
          {items.map((item, i) => (
            <button
              key={item.key}
              onClick={() => go(item.href)}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                i === highlight ? "bg-bb-elevated" : ""
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-white truncate">{item.title}</span>
                {item.subtitle && (
                  <span className="block text-[11px] text-bb-dim truncate capitalize">{item.subtitle}</span>
                )}
              </span>
              {i === highlight && <CornerDownLeft size={13} className="text-bb-dim shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
