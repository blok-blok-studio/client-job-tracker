"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { friendlyError, readJson } from "@/lib/fetch-json";
import type { SocialPersonOption } from "@/app/api/social-people/route";
import { Avatar } from "./ui";

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
const MAX_SUGGESTIONS = 8;

function normalize(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

// One fetch per platform shared by every field on the page; cleared after a save
const cache = new Map<string, Promise<SocialPersonOption[]>>();

function loadPeople(platform: string, fresh = false): Promise<SocialPersonOption[]> {
  if (fresh) cache.delete(platform);
  let pending = cache.get(platform);
  if (!pending) {
    pending = fetch(`/api/social-people?platform=${platform}`)
      .then((res) => readJson<{ data: SocialPersonOption[] }>(res))
      .then((r) => (r.ok && r.data ? r.data.data : []))
      .catch(() => []);
    cache.set(platform, pending);
  }
  return pending;
}

/**
 * Chip input for @handles with a dropdown of people already tagged on past
 * posts or saved by name. Typing searches names and handles.
 */
export default function PeopleInput({
  values,
  onChange,
  platform = "INSTAGRAM",
  placeholder = "Name or username",
  max,
  disabled,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  platform?: string;
  placeholder?: string;
  max?: number;
  disabled?: boolean;
}) {
  const [people, setPeople] = useState<SocialPersonOption[]>([]);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [nameDraft, setNameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const atMax = max !== undefined && values.length >= max;

  useEffect(() => {
    let live = true;
    loadPeople(platform).then((list) => live && setPeople(list));
    return () => {
      live = false;
    };
  }, [platform]);

  const byHandle = useMemo(() => new Map(people.map((p) => [p.handle, p])), [people]);
  const query = normalize(input);
  const selected = new Set(values.map(normalize));

  const suggestions = useMemo(() => {
    const q = input.trim().replace(/^@+/, "").toLowerCase();
    return people
      .filter((p) => !selected.has(p.handle))
      .filter((p) => !q || p.handle.includes(q) || (p.name || "").toLowerCase().includes(q))
      .slice(0, MAX_SUGGESTIONS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, input, values]);

  const exact = query ? byHandle.get(query) : undefined;
  // Offer to save a name when the typed handle is new, or known but unnamed
  const canSaveName = HANDLE_RE.test(query) && !selected.has(query) && !exact?.name;

  const add = (handles: string[]) => {
    const next = [...values];
    for (const h of handles.map(normalize).filter(Boolean)) {
      if (!next.map(normalize).includes(h) && (max === undefined || next.length < max)) next.push(h);
    }
    onChange(next);
    setInput("");
    setNameDraft("");
    setHighlight(0);
    setError(null);
  };

  // Only a real username gets added from typed text; a half-typed name stays put
  const commitTyped = () => {
    const handles = input.split(/[\s,]+/).map(normalize).filter(Boolean);
    if (handles.length && handles.every((h) => HANDLE_RE.test(h))) add(handles);
  };

  const saveAndAdd = async () => {
    const name = nameDraft.trim();
    if (!name) return add([query]);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/social-people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, handle: query, name }),
      });
      const result = await readJson(res, "Couldn't save that person");
      if (!result.ok) throw new Error(result.error || "Couldn't save that person");
      add([query]);
      setPeople(await loadPeople(platform, true));
    } catch (err) {
      setError(friendlyError(err, "Couldn't save that person"));
    } finally {
      setSaving(false);
    }
  };

  const forget = async (person: SocialPersonOption) => {
    if (!person.id) return;
    const res = await fetch(`/api/social-people/${person.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setPeople(await loadPeople(platform, true));
  };

  return (
    <div
      ref={wrapRef}
      className="relative"
      onBlur={(e) => {
        if (wrapRef.current?.contains(e.relatedTarget as Node | null)) return;
        if (input.trim() && !saving) commitTyped();
        setOpen(false);
      }}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 bg-bb-elevated border border-bb-border rounded-lg px-2 py-1.5 focus-within:border-bb-orange/60 transition-colors",
          disabled && "opacity-50"
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((v) => {
          const name = byHandle.get(normalize(v))?.name;
          return (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-bb-surface border border-bb-border pl-2 pr-1 py-0.5 text-xs text-white">
              {name && <span className="font-medium">{name}</span>}
              <span className={name ? "text-bb-dim" : undefined}>@{v}</span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${v}`}
                  onClick={() => onChange(values.filter((x) => x !== v))}
                  className="p-0.5 rounded-full text-bb-dim hover:text-white cursor-pointer"
                >
                  <X size={10} />
                </button>
              )}
            </span>
          );
        })}
        {!atMax && !disabled && (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setHighlight(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setHighlight((h) => Math.min(h + 1, Math.max(suggestions.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Escape") {
                setOpen(false);
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (exact && !selected.has(exact.handle)) add([exact.handle]);
                else if (open && suggestions[highlight]) add([suggestions[highlight].handle]);
                else if (input.trim()) commitTyped();
              } else if (e.key === ",") {
                e.preventDefault();
                commitTyped();
              } else if (e.key === "Backspace" && !input && values.length) {
                onChange(values.slice(0, -1));
              }
            }}
            placeholder={values.length ? "" : placeholder}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="flex-1 min-w-[120px] bg-transparent text-base sm:text-sm text-white placeholder:text-bb-dim outline-none py-0.5"
          />
        )}
      </div>

      {open && !disabled && !atMax && (suggestions.length > 0 || canSaveName) && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border border-bb-border bg-bb-surface shadow-xl overflow-hidden">
          {suggestions.length > 0 && (
            <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
              {suggestions.map((p, i) => (
                <li
                  key={p.handle}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => add([p.handle])}
                  className={cn(
                    "group flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer",
                    i === highlight ? "bg-bb-elevated" : "hover:bg-bb-elevated"
                  )}
                >
                  <Avatar name={p.name || p.handle} size={24} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{p.name || `@${p.handle}`}</p>
                    {p.name && <p className="text-[11px] text-bb-dim truncate">@{p.handle}</p>}
                  </div>
                  {p.uses > 0 && <span className="text-[10px] text-bb-dim shrink-0">used {p.uses}×</span>}
                  {p.id && (
                    <button
                      type="button"
                      aria-label={`Forget ${p.name || p.handle}`}
                      title="Remove from saved people"
                      onClick={(e) => {
                        e.stopPropagation();
                        forget(p);
                      }}
                      className="p-1 rounded text-bb-dim opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-white cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canSaveName && (
            <div className="border-t border-bb-border p-2 space-y-1.5">
              <p className="text-[11px] text-bb-dim">
                <UserPlus size={11} className="inline -mt-0.5 mr-1" />
                Add @{query}. Give them a name to find them by it next time.
              </p>
              <div className="flex gap-1.5">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveAndAdd();
                    } else if (e.key === "Escape") {
                      setOpen(false);
                    }
                  }}
                  placeholder="Their name (optional)"
                  className="flex-1 min-w-0 bg-bb-elevated border border-bb-border rounded-md px-2 py-1 text-xs text-white placeholder:text-bb-dim outline-none focus:border-bb-orange/60"
                />
                <button
                  type="button"
                  onClick={saveAndAdd}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-md bg-bb-orange px-2.5 py-1 text-xs font-medium text-white hover:bg-bb-orange-light disabled:opacity-50 cursor-pointer"
                >
                  {saving && <Loader2 size={11} className="animate-spin" />}
                  Add
                </button>
              </div>
              {error && <p className="text-[11px] text-red-400">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
