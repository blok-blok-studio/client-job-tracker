"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Check, ExternalLink, Loader2, Music, Pencil, Plus, Trash2, TrendingUp, Upload, X } from "lucide-react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/Toast";
import PlatformIcon, { getPlatformLabel } from "@/components/content/PlatformIcon";
import { uploadFile } from "@/lib/client-upload";
import { friendlyError, readJson } from "@/lib/fetch-json";
import { platformFromSoundUrl, type SoundPlatform } from "@/lib/trending-sound";
import { cn } from "@/lib/utils";

interface Sound {
  id: string;
  name: string;
  artist: string | null;
  platform: SoundPlatform;
  url: string;
  note: string | null;
  addedBy: string | null;
  archived: boolean;
  createdAt: string;
  client: { id: string; name: string } | null;
}

interface Track {
  id: string;
  title: string;
  url: string;
  duration: number;
  createdAt: string;
}

const field =
  "w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange";

function formatDuration(seconds: number) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Track length read in the browser; 0 when the file can't be read. */
function audioSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const href = URL.createObjectURL(file);
    const el = new Audio();
    const done = (n: number) => {
      URL.revokeObjectURL(href);
      resolve(Number.isFinite(n) ? n : 0);
    };
    const timer = setTimeout(() => done(0), 8000);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      clearTimeout(timer);
      done(el.duration);
    };
    el.onerror = () => {
      clearTimeout(timer);
      done(0);
    };
    el.src = href;
  });
}

export default function AudioTab({ clients }: { clients: { id: string; name: string }[] }) {
  return (
    <div className="space-y-4">
      <TrendingSounds clients={clients} />
      <UploadedTracks />
    </div>
  );
}

/* ─── Trending sounds ─────────────────────────────────────────────────────── */

function TrendingSounds({ clients }: { clients: { id: string; name: string }[] }) {
  const { toast } = useToast();
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<"" | SoundPlatform>("");
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ url: "", name: "", artist: "", clientId: "", note: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Sound | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trending-sounds?includeArchived=1");
      const result = await readJson<{ data: Sound[] }>(res, "Couldn't load the sounds.");
      if (result.ok && result.data) setSounds(result.data.data);
      else toast(result.error || "Couldn't load the sounds.", "error");
    } catch {
      toast("Couldn't load the sounds.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const detected = form.url.trim() ? platformFromSoundUrl(form.url) : null;

  const save = async () => {
    setFormError(null);
    if (!detected) {
      setFormError("Paste the sound's link from Instagram or TikTok. Open the sound in the app, tap Share, then Copy link.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Give the sound a name so the team can find it.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/trending-sounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await readJson<{ data: Sound }>(res, "Couldn't save the sound.");
      if (!result.ok || !result.data) {
        setFormError(result.error || "Couldn't save the sound.");
        return;
      }
      setSounds((s) => [result.data!.data, ...s]);
      setForm({ url: "", name: "", artist: "", clientId: "", note: "" });
      setFormOpen(false);
      toast("Sound saved. Pick it on a post in the composer.", "success");
    } catch (err) {
      setFormError(friendlyError(err, "Couldn't save the sound."));
    } finally {
      setSaving(false);
    }
  };

  const setArchived = async (sound: Sound, archived: boolean) => {
    setSounds((s) => s.map((x) => (x.id === sound.id ? { ...x, archived } : x)));
    const res = await fetch(`/api/trending-sounds/${sound.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    }).catch(() => null);
    if (!res?.ok) {
      setSounds((s) => s.map((x) => (x.id === sound.id ? { ...x, archived: !archived } : x)));
      toast("Couldn't update the sound.", "error");
    }
  };

  const remove = async (sound: Sound) => {
    const res = await fetch(`/api/trending-sounds/${sound.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast("Couldn't delete the sound.", "error");
      return;
    }
    setSounds((s) => s.filter((x) => x.id !== sound.id));
  };

  const visible = sounds.filter((s) => (!platform || s.platform === platform) && (showArchived || !s.archived));
  const archivedCount = sounds.filter((s) => s.archived).length;

  return (
    <section className="bg-bb-surface border border-bb-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-white">
            <TrendingUp size={15} className="text-bb-orange" /> Trending sounds
          </h2>
          <p className="text-xs text-bb-dim mt-1 max-w-xl">
            Save sounds you spot in Instagram or TikTok, then pick one on a post in the composer. Instagram and TikTok only let their sounds be added inside the app, so
            a post with a trending sound goes out by hand: the person posting gets the video, the caption and a button that opens the sound.
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-bb-orange text-white rounded-lg text-sm font-medium hover:bg-bb-orange-light transition-colors cursor-pointer"
          >
            <Plus size={15} /> Add sound
          </button>
        )}
      </div>

      {formOpen && (
        <div className="rounded-lg border border-bb-border bg-bb-elevated/40 p-3 space-y-2">
          <div>
            <label htmlFor="sound-url" className="text-xs font-medium text-bb-muted mb-1 block">
              Link to the sound
            </label>
            <input
              id="sound-url"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://www.instagram.com/reels/audio/... or https://www.tiktok.com/music/..."
              className={field}
            />
            <p className="text-[11px] text-bb-dim mt-1">
              {detected ? (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <Check size={11} /> {getPlatformLabel(detected)} sound
                </span>
              ) : (
                "In the app: open the sound, tap Share, then Copy link."
              )}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="sound-name" className="text-xs font-medium text-bb-muted mb-1 block">
                Sound name
              </label>
              <input id="sound-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="As it shows in the app" className={field} />
            </div>
            <div>
              <label htmlFor="sound-artist" className="text-xs font-medium text-bb-muted mb-1 block">
                Artist <span className="text-bb-dim font-normal">(optional)</span>
              </label>
              <input id="sound-artist" value={form.artist} onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))} className={field} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="sound-client" className="text-xs font-medium text-bb-muted mb-1 block">
                Good for <span className="text-bb-dim font-normal">(optional)</span>
              </label>
              <select id="sound-client" value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} className={field}>
                <option value="">Any client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sound-note" className="text-xs font-medium text-bb-muted mb-1 block">
                Note <span className="text-bb-dim font-normal">(optional)</span>
              </label>
              <input id="sound-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Idea for how to use it" className={field} />
            </div>
          </div>
          {formError && <p className="text-xs text-red-400">{formError}</p>}
          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setFormError(null);
              }}
              disabled={saving}
              className="px-4 py-3 sm:py-2 rounded-lg border border-bb-border text-sm text-bb-muted hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2 rounded-lg bg-bb-orange text-white text-sm font-medium hover:bg-bb-orange-light transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Save sound
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(["", "INSTAGRAM", "TIKTOK"] as const).map((p) => (
          <button
            key={p || "all"}
            type="button"
            onClick={() => setPlatform(p)}
            className={cn(
              "px-3 py-1.5 rounded-full border text-xs transition-colors cursor-pointer",
              platform === p ? "border-bb-orange/60 bg-bb-orange/10 text-white" : "border-bb-border text-bb-muted hover:text-white"
            )}
          >
            {p ? getPlatformLabel(p) : "All"}
          </button>
        ))}
        {archivedCount > 0 && (
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="ml-auto text-xs text-bb-dim hover:text-white transition-colors cursor-pointer">
            {showArchived ? "Hide" : "Show"} archived ({archivedCount})
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-bb-dim">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-xs text-bb-dim text-center py-6">{sounds.length ? "No sounds match." : "No sounds saved yet."}</p>
      ) : (
        <ul className="divide-y divide-bb-border border border-bb-border rounded-lg overflow-hidden">
          {visible.map((s) => (
            <li key={s.id} className={cn("flex items-start gap-3 p-3", s.archived && "opacity-50")}>
              <span className="mt-0.5 w-8 h-8 rounded-lg bg-bb-elevated flex items-center justify-center shrink-0">
                <PlatformIcon platform={s.platform} size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white break-words">
                  {s.name}
                  {s.artist && <span className="text-bb-muted"> · {s.artist}</span>}
                </p>
                {s.note && <p className="text-xs text-bb-muted mt-0.5 break-words">{s.note}</p>}
                <p className="text-[11px] text-bb-dim mt-0.5">
                  {s.client ? `${s.client.name} · ` : ""}
                  {s.addedBy ? `${s.addedBy} · ` : ""}
                  {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  {s.archived ? " · archived" : ""}
                </p>
              </div>
              <div className="flex items-center shrink-0">
                <a href={s.url} target="_blank" rel="noopener noreferrer" title="Open the sound" aria-label={`Open ${s.name}`} className="p-2.5 sm:p-2 text-bb-muted hover:text-bb-orange transition-colors">
                  <ExternalLink size={15} />
                </a>
                <button
                  type="button"
                  onClick={() => setArchived(s, !s.archived)}
                  title={s.archived ? "Bring back" : "Archive (trend is over)"}
                  aria-label={s.archived ? `Bring back ${s.name}` : `Archive ${s.name}`}
                  className="p-2.5 sm:p-2 text-bb-muted hover:text-white transition-colors cursor-pointer"
                >
                  {s.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                </button>
                <button type="button" onClick={() => setToDelete(s)} title="Delete" aria-label={`Delete ${s.name}`} className="p-2.5 sm:p-2 text-bb-muted hover:text-red-400 transition-colors cursor-pointer">
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove(toDelete);
          setToDelete(null);
        }}
        title="Delete this sound?"
        message={`"${toDelete?.name || ""}" leaves the list. Posts it was already picked on keep the name and link.`}
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </section>
  );
}

/* ─── Uploaded MP3s ───────────────────────────────────────────────────────── */

function UploadedTracks() {
  const { toast } = useToast();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<{ name: string; pct: number }[]>([]);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [toDelete, setToDelete] = useState<Track | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/audio-tracks?source=upload")
      .then((r) => readJson<{ data: Track[] }>(r, "Couldn't load the tracks."))
      .then((result) => {
        if (result.ok && result.data) setTracks(result.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|wav|aac|ogg)$/i.test(file.name)) {
        toast(`${file.name} isn't an audio file. Use an MP3, M4A or WAV.`, "error");
        continue;
      }
      setUploads((u) => [...u, { name: file.name, pct: 0 }]);
      try {
        const duration = await audioSeconds(file);
        const { url } = await uploadFile(file, {
          onProgress: (loaded, total) => setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, pct: total ? Math.round((loaded / total) * 100) : 0 } : x))),
        });
        const res = await fetch("/api/audio-tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: file.name.replace(/\.[^/.]+$/, ""), url, source: "upload", duration }),
        });
        const result = await readJson<{ data: Track }>(res, `Couldn't save ${file.name}.`);
        if (!result.ok || !result.data) throw new Error(result.error || `Couldn't save ${file.name}.`);
        setTracks((t) => [result.data!.data, ...t]);
      } catch (err) {
        toast(friendlyError(err, `Couldn't upload ${file.name}.`), "error");
      } finally {
        setUploads((u) => u.filter((x) => x.name !== file.name));
      }
    }
  };

  const rename = async () => {
    if (!editing) return;
    const title = editing.title.trim();
    const id = editing.id;
    setEditing(null);
    if (!title) return;
    const res = await fetch(`/api/audio-tracks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => null);
    if (!res?.ok) {
      toast("Couldn't rename the track.", "error");
      return;
    }
    setTracks((t) => t.map((x) => (x.id === id ? { ...x, title } : x)));
  };

  const remove = async (track: Track) => {
    const res = await fetch(`/api/audio-tracks/${track.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast("Couldn't delete the track.", "error");
      return;
    }
    setTracks((t) => t.filter((x) => x.id !== track.id));
  };

  return (
    <section className="bg-bb-surface border border-bb-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-white">
            <Music size={15} className="text-bb-orange" /> Uploaded MP3s
          </h2>
          <p className="text-xs text-bb-dim mt-1 max-w-xl">
            Audio files the team can put on any client&apos;s post. In the composer, add a video and choose &ldquo;Add an MP3 to this video&rdquo;, or add photos and choose
            &ldquo;Add audio and post as a Reel&rdquo;. The track is baked into the video, so these posts still publish automatically. Only upload audio you have the rights to.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-bb-orange text-white rounded-lg text-sm font-medium hover:bg-bb-orange-light transition-colors cursor-pointer"
        >
          <Upload size={15} /> Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="audio/*,.mp3,.m4a,.wav,.aac"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={cn("rounded-lg border transition-colors", dragOver ? "border-bb-orange/60 bg-bb-orange/5" : "border-bb-border")}
      >
        {uploads.map((u) => (
          <div key={u.name} className="flex items-center gap-2 p-3 border-b border-bb-border text-xs text-bb-muted">
            <Loader2 size={13} className="animate-spin text-bb-orange shrink-0" />
            <span className="truncate flex-1">{u.name}</span>
            <span className="font-mono text-bb-dim">{u.pct}%</span>
          </div>
        ))}
        {loading ? (
          <div className="flex justify-center py-8 text-bb-dim">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : tracks.length === 0 && uploads.length === 0 ? (
          <p className="text-xs text-bb-dim text-center py-6">
            No tracks yet. Upload an MP3, M4A or WAV<span className="hidden sm:inline">, or drop files here</span>.
          </p>
        ) : (
          <ul className="divide-y divide-bb-border">
            {tracks.map((t) => (
              <li key={t.id} className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  {editing?.id === t.id ? (
                    <>
                      <input
                        autoFocus
                        value={editing.title}
                        onChange={(e) => setEditing({ id: t.id, title: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") rename();
                          if (e.key === "Escape") setEditing(null);
                        }}
                        aria-label="Track name"
                        className={cn(field, "flex-1 min-w-0")}
                      />
                      <button type="button" onClick={rename} aria-label="Save name" className="p-2.5 sm:p-2 text-emerald-400 hover:text-emerald-300 cursor-pointer">
                        <Check size={15} />
                      </button>
                      <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="p-2.5 sm:p-2 text-bb-muted hover:text-white cursor-pointer">
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="flex-1 min-w-0 text-sm text-white truncate">
                        {t.title}
                        {t.duration > 0 && <span className="text-[11px] text-bb-dim font-mono ml-2">{formatDuration(t.duration)}</span>}
                      </p>
                      <button type="button" onClick={() => setEditing({ id: t.id, title: t.title })} title="Rename" aria-label={`Rename ${t.title}`} className="p-2.5 sm:p-2 text-bb-muted hover:text-white transition-colors cursor-pointer">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => setToDelete(t)} title="Delete" aria-label={`Delete ${t.title}`} className="p-2.5 sm:p-2 text-bb-muted hover:text-red-400 transition-colors cursor-pointer">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls preload="none" src={t.url} className="w-full h-9" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove(toDelete);
          setToDelete(null);
        }}
        title="Delete this track?"
        message={`"${toDelete?.title || ""}" leaves the list. Videos already made with it keep their audio.`}
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </section>
  );
}
