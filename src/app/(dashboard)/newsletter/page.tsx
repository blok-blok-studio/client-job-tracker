"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, Plus, Trash2, Download, Send, Loader2, Users } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/Toast";

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  source: string;
  subscribedAt: string;
  unsubscribedAt: string | null;
}

interface Campaign {
  id: string;
  subject: string;
  sentBy: string;
  recipients: number;
  sentAt: string;
}

export default function NewsletterPage() {
  const { toast } = useToast();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/newsletter");
      const data = await res.json();
      if (data.success) {
        setSubscribers(data.data.subscribers);
        setCampaigns(data.data.campaigns);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsOwner(d?.user?.role === "OWNER"))
      .catch(() => {});
  }, [load]);

  const active = subscribers.filter((s) => !s.unsubscribedAt);
  const last30 = active.filter(
    (s) => new Date(s.subscribedAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ).length;

  async function addSubscriber(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim() || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setNewEmail("");
        toast("Subscriber added", "success");
        load();
      } else {
        toast(data.error || "Failed", "error");
      }
    } finally {
      setAdding(false);
    }
  }

  async function removeSubscriber(id: string) {
    setSubscribers((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/newsletter/${id}`, { method: "DELETE" });
  }

  function exportCsv() {
    const rows = [
      "email,name,source,subscribed_at",
      ...active.map((s) => `${s.email},${s.name || ""},${s.source},${s.subscribedAt}`),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "newsletter-subscribers.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function sendCampaign() {
    setSending(true);
    try {
      const res = await fetch("/api/newsletter/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast(`Sent to ${data.sent} subscriber${data.sent !== 1 ? "s" : ""}${data.failed ? ` (${data.failed} failed)` : ""}`, "success");
        setSubject("");
        setMessage("");
        load();
      } else {
        toast(data.error || "Send failed", "error");
      }
    } finally {
      setSending(false);
      setConfirmSend(false);
    }
  }

  return (
    <div>
      <TopBar title="Newsletter" subtitle="Subscriber list and email campaigns" />
      <div className="px-4 lg:px-6 pb-8 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Subscribers", value: active.length },
            { label: "New · 30 days", value: last30 },
            { label: "Campaigns sent", value: campaigns.length },
          ].map((t) => (
            <div key={t.label} className="bg-bb-surface border border-bb-border rounded-lg p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-bb-dim mb-1">{t.label}</p>
              <p className="text-2xl font-display font-bold text-white">{t.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Compose */}
          <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
            <h3 className="flex items-center gap-2 text-sm font-display font-semibold text-white mb-3">
              <Send size={14} className="text-bb-orange" /> Send a campaign
            </h3>
            {isOwner ? (
              <div className="space-y-2.5">
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject line"
                  className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
                />
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={7}
                  placeholder={"Write your update…\n\nBlank lines become paragraphs. Sent with the Blok Blok template and an unsubscribe link."}
                  className="w-full px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => setConfirmSend(true)}
                    disabled={!subject.trim() || !message.trim() || active.length === 0 || sending}
                    className="flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
                  >
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Send to {active.length} subscriber{active.length !== 1 ? "s" : ""}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-bb-dim py-4">Only owners can send campaigns.</p>
            )}

            {campaigns.length > 0 && (
              <div className="mt-4 pt-3 border-t border-bb-border space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-bb-dim">History</p>
                {campaigns.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-xs">
                    <Mail size={11} className="text-bb-dim shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-white">{c.subject}</span>
                    <span className="text-bb-dim shrink-0">
                      {c.recipients} · {new Date(c.sentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subscribers */}
          <div className="bg-bb-surface border border-bb-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="flex items-center gap-2 text-sm font-display font-semibold text-white">
                <Users size={14} className="text-bb-orange" /> Subscribers
              </h3>
              {active.length > 0 && (
                <button onClick={exportCsv} className="flex items-center gap-1 text-xs text-bb-dim hover:text-white transition-colors">
                  <Download size={12} /> CSV
                </button>
              )}
            </div>

            <form onSubmit={addSubscriber} className="flex items-center gap-2 mb-3">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Add an email…"
                className="flex-1 px-3 py-2 bg-bb-black border border-bb-border rounded-lg text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
              />
              <button
                type="submit"
                disabled={!newEmail.trim() || adding}
                className="p-2 rounded-lg bg-bb-elevated text-bb-dim hover:text-bb-orange disabled:opacity-40 transition-colors"
              >
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              </button>
            </form>

            {loading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-9 w-full" />)}
              </div>
            ) : subscribers.length === 0 ? (
              <p className="text-xs text-bb-dim py-4 text-center">
                No subscribers yet — add one above, or embed the public signup endpoint on your site.
              </p>
            ) : (
              <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
                {subscribers.map((s) => (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-2 rounded-lg bg-bb-black border border-bb-border px-3 py-2 ${s.unsubscribedAt ? "opacity-50" : ""}`}
                  >
                    <span className="flex-1 min-w-0 truncate text-xs text-white">{s.email}</span>
                    {s.unsubscribedAt && <span className="text-[9px] text-red-400 shrink-0">unsubscribed</span>}
                    <span className="text-[10px] text-bb-dim shrink-0 capitalize">{s.source}</span>
                    <span className="text-[10px] text-bb-dim shrink-0">
                      {new Date(s.subscribedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    <button
                      onClick={() => removeSubscriber(s.id)}
                      className="opacity-0 group-hover:opacity-100 text-bb-dim hover:text-red-400 transition-opacity shrink-0"
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={sendCampaign}
        title="Send campaign"
        message={`Email "${subject}" to ${active.length} subscriber${active.length !== 1 ? "s" : ""}? This cannot be undone.`}
        confirmLabel="Send now"
        loading={sending}
      />
    </div>
  );
}
