"use client";

import { useEffect, useState } from "react";

interface Option { id: string; name: string; company?: string | null }

// Owner-only: fold a duplicate client record into this one
export default function ClientMerge({ clientId, onMerged }: { clientId: string; onMerged: () => void }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [fromId, setFromId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open || options.length) return;
    fetch("/api/clients?type=ALL")
      .then((r) => r.json())
      .then((d) => {
        const list = ((d?.data || []) as Option[]).filter((c) => c.id !== clientId).map((c) => ({ id: c.id, name: c.name, company: c.company }));
        list.sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name));
        setOptions(list);
      })
      .catch(() => {});
  }, [open, options.length, clientId]);

  async function merge() {
    const other = options.find((o) => o.id === fromId);
    if (!other || !window.confirm(`Merge "${other.company || other.name}" into this client? Its records move here and it gets archived.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/merge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromId }) });
      const j = await r.json().catch(() => ({}));
      if (!j.success) throw new Error(j.error || "Merge failed");
      const d = j.data as { moved: number; keptOnDuplicate: number; filled: string[] };
      setMsg(`Merged. ${d.moved} records moved${d.filled.length ? `, filled ${d.filled.join(", ")}` : ""}${d.keptOnDuplicate ? `, ${d.keptOnDuplicate} left on the archived copy` : ""}.`);
      setFromId("");
      setOptions([]);
      onMerged();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-bb-surface border border-bb-border rounded-xl p-4 text-sm">
      {!open ? (
        <button className="text-xs text-bb-dim hover:text-white" onClick={() => setOpen(true)}>Merge a duplicate client into this one…</button>
      ) : (
        <div className="space-y-2">
          <p className="text-white font-medium">Merge a duplicate</p>
          <p className="text-xs text-bb-dim">Everything from the other record moves here. Blank details here get filled from it. The other record is archived, not deleted.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <select aria-label="Duplicate client" className="bg-bb-black border border-bb-border rounded-lg px-3 py-1.5 text-sm text-white" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">Pick the duplicate…</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.company ? `${o.company} (${o.name})` : o.name}</option>)}
            </select>
            <button className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 border border-red-500/30 text-xs disabled:opacity-40" disabled={!fromId || busy} onClick={merge}>{busy ? "Merging…" : "Merge into this client"}</button>
            <button className="text-xs text-bb-dim" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {msg && <p className="text-xs text-bb-muted">{msg}</p>}
        </div>
      )}
    </div>
  );
}
