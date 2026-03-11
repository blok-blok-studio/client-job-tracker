"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Eye, EyeOff, Copy, ExternalLink, RotateCcw } from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Modal from "@/components/shared/Modal";
import { PLATFORM_OPTIONS } from "@/types";

interface Credential {
  id: string;
  platform: string;
  label: string | null;
  username: string;
  password: string;
  url: string | null;
  lastRotated: string | null;
  client: { id: string; name: string };
}

interface RevealedData {
  username: string;
  password: string;
  notes: string | null;
}

const platformColors: Record<string, string> = {
  Instagram: "border-l-pink-500",
  LinkedIn: "border-l-blue-600",
  "Meta Business": "border-l-blue-500",
  TikTok: "border-l-white",
  Canva: "border-l-cyan-400",
  Google: "border-l-green-500",
  "Twitter/X": "border-l-white",
  YouTube: "border-l-red-600",
  GitHub: "border-l-purple-500",
  Figma: "border-l-violet-500",
};

export default function VaultPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, RevealedData>>({});
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchCredentials = useCallback(async () => {
    const res = await fetch("/api/vault");
    const data = await res.json();
    if (data.success) setCredentials(data.data);
  }, []);

  useEffect(() => {
    fetchCredentials();
    fetch("/api/clients").then((r) => r.json()).then((d) => {
      if (d.success) setClients(d.data.map((c: Record<string, string>) => ({ id: c.id, name: c.name })));
    });
  }, [fetchCredentials]);

  async function handleReveal(id: string) {
    if (revealed[id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    const res = await fetch(`/api/vault/${id}/reveal`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      setRevealed((prev) => ({ ...prev, [id]: data.data }));
    }
  }

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    // Auto-clear clipboard after 30 seconds
    setTimeout(() => navigator.clipboard.writeText(""), 30000);
  }

  async function handleAddCredential(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      clientId: formData.get("clientId") as string,
      platform: formData.get("platform") === "Other" ? formData.get("customPlatform") as string : formData.get("platform") as string,
      label: formData.get("label") as string,
      username: formData.get("username") as string,
      password: formData.get("password") as string,
      url: formData.get("url") as string,
      notes: formData.get("notes") as string,
    };
    await fetch("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setShowAdd(false);
    fetchCredentials();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/vault/${id}`, { method: "DELETE" });
    fetchCredentials();
  }

  // Group by client
  const grouped = credentials
    .filter((c) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return c.client.name.toLowerCase().includes(s) || c.platform.toLowerCase().includes(s);
    })
    .reduce<Record<string, Credential[]>>((acc, cred) => {
      const key = cred.client.name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(cred);
      return acc;
    }, {});

  const inputClass = "w-full px-3 py-2 bg-bb-black border border-bb-border rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-bb-orange/50";

  return (
    <div>
      <TopBar title="Credential Vault" subtitle="Encrypted client credentials" />
      <div className="px-4 lg:px-6 pb-8 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bb-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by client or platform..."
              className="w-full pl-9 pr-4 py-2 bg-bb-surface border border-bb-border rounded-md text-sm text-white placeholder:text-bb-dim focus:outline-none focus:ring-2 focus:ring-bb-orange/50"
            />
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md shrink-0">
            <Plus size={16} /> Add Credential
          </button>
        </div>

        {Object.entries(grouped).map(([clientName, creds]) => (
          <div key={clientName} className="space-y-2">
            <h3 className="font-display font-semibold text-bb-muted">{clientName}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {creds.map((cred) => {
                const rev = revealed[cred.id];
                return (
                  <div key={cred.id} className={`bg-bb-surface border border-bb-border border-l-4 ${platformColors[cred.platform] || "border-l-bb-dim"} rounded-lg p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{cred.platform}</span>
                        {cred.label && <span className="text-xs text-bb-dim">({cred.label})</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {cred.url && (
                          <a href={cred.url} target="_blank" rel="noopener noreferrer" className="p-1 text-bb-dim hover:text-white">
                            <ExternalLink size={14} />
                          </a>
                        )}
                        <button onClick={() => handleDelete(cred.id)} className="p-1 text-bb-dim hover:text-red-400 text-xs">
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-bb-dim">Username</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-bb-muted">{rev ? rev.username : cred.username}</span>
                          <button
                            onClick={() => copyToClipboard(rev?.username || cred.username, `u-${cred.id}`)}
                            className="p-1 text-bb-dim hover:text-white"
                          >
                            <Copy size={12} />
                          </button>
                          {copiedId === `u-${cred.id}` && <span className="text-xs text-green-400">Copied</span>}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-bb-dim">Password</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-bb-muted">{rev ? rev.password : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}</span>
                          <button onClick={() => handleReveal(cred.id)} className="p-1 text-bb-dim hover:text-white">
                            {rev ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          {rev && (
                            <button
                              onClick={() => copyToClipboard(rev.password, `p-${cred.id}`)}
                              className="p-1 text-bb-dim hover:text-white"
                            >
                              <Copy size={12} />
                            </button>
                          )}
                          {copiedId === `p-${cred.id}` && <span className="text-xs text-green-400">Copied</span>}
                        </div>
                      </div>

                      {cred.lastRotated && (
                        <div className="flex items-center gap-1 text-xs text-bb-dim">
                          <RotateCcw size={10} /> Last rotated: {new Date(cred.lastRotated).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-12 text-bb-dim">No credentials stored yet</div>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Credential">
        <form onSubmit={handleAddCredential} className="space-y-4">
          <div>
            <label className="block text-sm text-bb-muted mb-1">Client *</label>
            <select name="clientId" required className={inputClass}>
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Platform *</label>
            <select name="platform" required className={inputClass}>
              {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Label</label>
            <input name="label" className={inputClass} placeholder="e.g., Main account" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-bb-muted mb-1">Username *</label>
              <input name="username" required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm text-bb-muted mb-1">Password *</label>
              <input name="password" type="password" required className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Login URL</label>
            <input name="url" type="url" className={inputClass} placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm text-bb-muted mb-1">Notes</label>
            <textarea name="notes" rows={2} className={inputClass} placeholder="Any additional notes..." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-bb-muted">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-md">Save Credential</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
