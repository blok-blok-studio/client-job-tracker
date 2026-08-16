"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, MessageSquare, AtSign, UserPlus } from "lucide-react";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  task_assigned: <UserPlus size={13} className="text-bb-orange" />,
  mention: <AtSign size={13} className="text-bb-orange" />,
  task_comment: <MessageSquare size={13} className="text-bb-orange" />,
};

function ago(dateStr: string): string {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Bell + inbox dropdown: assignments, @mentions, comment replies. Polls softly. */
export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setItems(data.data.notifications);
        setUnread(data.data.unread);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  // Close when clicking anywhere else
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    setUnread(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  async function openItem(n: NotificationRow) {
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {});
    }
    setOpen(false);
    if (n.link) {
      // kanban deep links (?task=) are read via window.location on mount
      window.location.href = n.link;
    } else {
      router.refresh();
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg hover:bg-bb-elevated text-bb-muted hover:text-white transition-colors relative"
        title="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-bb-orange text-[9px] font-bold text-white flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-bb-border bg-bb-surface shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-bb-border">
            <p className="text-xs font-semibold text-white">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1 text-[10px] text-bb-dim hover:text-bb-orange transition-colors"
              >
                <CheckCheck size={11} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-bb-dim">Nothing yet — assignments and @mentions land here.</p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`w-full text-left px-3 py-2.5 border-b border-bb-border last:border-b-0 hover:bg-bb-elevated transition-colors ${
                  n.readAt ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">{TYPE_ICON[n.type] || <Bell size={13} className="text-bb-dim" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white leading-snug">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-[11px] text-bb-dim leading-snug line-clamp-2">{n.body}</p>}
                  </div>
                  <span className="text-[10px] text-bb-dim shrink-0">{ago(n.createdAt)}</span>
                  {!n.readAt && <span className="mt-1 w-1.5 h-1.5 rounded-full bg-bb-orange shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
