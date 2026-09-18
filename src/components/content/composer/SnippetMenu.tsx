"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, Bookmark, Loader2, Trash2, X } from "lucide-react";
import { readJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";
import { inputClass } from "./ui";

export interface Snippet {
  id: string;
  clientId: string | null;
  kind: "CAPTION" | "HASHTAGS";
  name: string;
  body: string | null;
  hashtags: string[];
}

interface Props {
  kind: Snippet["kind"];
  clientId: string;
  /** What "Save current" would store */
  current: { body?: string; hashtags?: string[] };
  disabled?: boolean;
  onInsert: (snippet: Snippet) => void;
}

/** Saved caption text or hashtag sets: insert one, or save what's in the post now. */
export default function SnippetMenu({ kind, clientId, current, disabled, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [allClients, setAllClients] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noun = kind === "CAPTION" ? "caption" : "hashtag set";
  const hasCurrent = kind === "CAPTION" ? !!current.body?.trim() : !!current.hashtags?.length;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/content-snippets${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`)
      .then((r) => readJson<{ data: Snippet[] }>(r, "Couldn't load saved snippets."))
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.data) setSnippets(result.data.data.filter((s) => s.kind === kind));
        else setError(result.error);
      })
      .catch(() => !cancelled && setError("Couldn't load saved snippets."));
    return () => {
      cancelled = true;
    };
  }, [open, clientId, kind]);

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Give it a name.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/content-snippets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name, clientId: allClients ? null : clientId || null, body: current.body, hashtags: current.hashtags }),
      });
      const result = await readJson<{ data: Snippet }>(res, "Couldn't save it.");
      if (!result.ok || !result.data) {
        setError(result.error || "Couldn't save it.");
        return;
      }
      setSnippets((s) => [...(s || []), result.data!.data].sort((a, b) => a.name.localeCompare(b.name)));
      setSaving(false);
      setName("");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (snippet: Snippet) => {
    const res = await fetch(`/api/content-snippets/${snippet.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setSnippets((s) => (s || []).filter((x) => x.id !== snippet.id));
    else setError("Couldn't delete it.");
  };

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-bb-muted hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Bookmark size={11} /> Saved
      </button>
    );
  }

  return (
    <div className="w-full mt-1.5 rounded-lg border border-bb-border bg-bb-elevated p-2.5 space-y-2 text-left">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-white">Saved {kind === "CAPTION" ? "captions" : "hashtag sets"}</p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSaving(false);
            setError(null);
          }}
          aria-label="Close"
          className="p-2 -m-2 text-bb-dim hover:text-white cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      {snippets === null && !error ? (
        <div className="flex justify-center py-3 text-bb-dim">
          <Loader2 size={15} className="animate-spin" />
        </div>
      ) : snippets && snippets.length === 0 ? (
        <p className="text-[11px] text-bb-dim">Nothing saved yet. {hasCurrent ? `Save this ${noun} to reuse it.` : `Write a ${noun} first, then save it here.`}</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto -mx-1">
          {(snippets || []).map((s) => (
            <li key={s.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onInsert(s);
                  setOpen(false);
                }}
                className="flex-1 min-w-0 text-left px-2 py-2 rounded-md hover:bg-bb-surface cursor-pointer transition-colors"
              >
                <span className="block text-xs text-white truncate">
                  {s.name}
                  {!s.clientId && <span className="text-bb-dim"> · all clients</span>}
                </span>
                <span className="block text-[11px] text-bb-dim truncate">{s.kind === "CAPTION" ? s.body : s.hashtags.map((t) => `#${t}`).join(" ")}</span>
              </button>
              <button type="button" onClick={() => remove(s)} aria-label={`Delete ${s.name}`} title="Delete" className="p-2 text-bb-dim hover:text-red-400 cursor-pointer transition-colors shrink-0">
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {saving ? (
        <div className="space-y-2 border-t border-bb-border pt-2">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder={`Name this ${noun}`} aria-label="Name" className={inputClass} />
          <label className={cn("flex items-center gap-2 text-xs text-bb-muted cursor-pointer", !clientId && "opacity-60")}>
            <input type="checkbox" checked={allClients || !clientId} disabled={!clientId} onChange={(e) => setAllClients(e.target.checked)} className="accent-bb-orange w-4 h-4" />
            Use on every client, not just this one
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSaving(false)} disabled={busy} className="px-3 py-2.5 sm:py-2 rounded-lg border border-bb-border text-xs text-bb-muted hover:text-white cursor-pointer transition-colors">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-bb-orange text-white text-xs font-medium cursor-pointer disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Save
            </button>
          </div>
        </div>
      ) : (
        hasCurrent && (
          <button type="button" onClick={() => setSaving(true)} className="inline-flex items-center gap-1.5 text-xs text-bb-orange hover:text-bb-orange-light cursor-pointer transition-colors">
            <BookmarkPlus size={13} /> Save the current {noun}
          </button>
        )
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
