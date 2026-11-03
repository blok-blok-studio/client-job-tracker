"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Sparkles, FileDown, Eye, Trash2, Upload, X, Check, Building2, UserRound, Plus, Image as ImageIcon, Award, Hash, PenLine, Palette,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/Toast";
import { upload } from "@vercel/blob/client";
import { readJson } from "@/lib/fetch-json";
import { PROOF } from "@/lib/pitches/proof";
import { SECTION_KEYS, SECTION_META, type PitchSections, type PitchStat } from "@/lib/pitches/types";
import { STATUS_LABEL, STATUS_STYLE, inputClass, shrinkForUpload, type PitchStatusKey } from "@/components/pitches/meta";

const MAX_MB = 25;
const MAX_IMAGES = 20;
const DIRECT_LIMIT = 3.5 * 1024 * 1024;

interface Img { id: string; caption: string | null; width: number; height: number }
interface Pitch {
  id: string;
  kind: "INTERNAL" | "BRAND";
  status: PitchStatusKey;
  title: string;
  brandName: string;
  brandWebsite: string | null;
  brandIndustry: string | null;
  brandColor: string | null;
  recipient: string | null;
  notes: string | null;
  authorName: string;
  sections: PitchSections;
  stats: PitchStat[];
  proof: string[];
  images: Img[];
  hasLogo: boolean;
  canEdit: boolean;
  updatedAt: string;
}
type Editable = Pick<Pitch, "kind" | "status" | "title" | "brandName" | "brandWebsite" | "brandIndustry" | "brandColor" | "recipient" | "sections" | "stats" | "proof">;

const card = "bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3";
const h3 = "flex items-center gap-2 text-sm font-display font-semibold text-white";
const small = "flex items-center gap-1.5 px-3 py-2 bg-bb-elevated hover:bg-bb-border text-bb-muted hover:text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40";

export default function PitchEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [logoKey, setLogoKey] = useState(0);
  const [uploading, setUploading] = useState<"logo" | "image" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notes, setNotes] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);
  const pending = useRef<Partial<Editable>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await readJson<{ data: Pitch }>(await fetch(`/api/pitches/${id}`));
    if (!r.ok) { setMissing(true); toast(r.error!, "error"); return; }
    const d = r.data!.data;
    setPitch({ ...d, sections: d.sections || {}, stats: Array.isArray(d.stats) ? d.stats : [] });
    setNotes(d.notes || "");
  }, [id, toast]);
  useEffect(() => { load(); }, [load]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const body = pending.current;
    if (Object.keys(body).length === 0) return true;
    pending.current = {};
    setSaving("saving");
    // empty stat rows are still being typed: keep them out of the save
    if (body.stats) body.stats = body.stats.filter((s) => s.value.trim() && s.label.trim());
    const r = await readJson(await fetch(`/api/pitches/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    if (!r.ok) { setSaving("error"); toast(r.error!, "error"); return false; }
    setSaving("saved");
    return true;
  }, [id, toast]);

  // save on leave
  useEffect(() => () => { if (Object.keys(pending.current).length) flush(); }, [flush]);

  const update = <K extends keyof Editable>(key: K, value: Editable[K]) => {
    setPitch((p) => (p ? { ...p, [key]: value } : p));
    pending.current = { ...pending.current, [key]: value };
    setSaving("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  };

  const openPdf = async (download: boolean) => {
    if (!(await flush())) return;
    window.open(`/api/pitches/${id}/pdf${download ? "?download=1" : ""}`, "_blank");
  };

  /** Small files post straight to the API; big ones go browser -> Blob first (Vercel caps a request at 4.5 MB). */
  const sendImage = async (path: "logo" | "images", file: File, method: "PUT" | "POST") => {
    if (file.size > MAX_MB * 1024 * 1024) return { ok: false as const, error: `${file.name} is over ${MAX_MB} MB` };
    const body = await shrinkForUpload(file, path === "logo" ? 1600 : 2400);
    if (body.size <= DIRECT_LIMIT) {
      const fd = new FormData();
      fd.append("file", body, file.name);
      return readJson<{ data: Img }>(await fetch(`/api/pitches/${id}/${path}`, { method, body: fd }));
    }
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80) || "image";
      const blob = await upload(`pitch-uploads/${id}/${safeName}`, body, {
        access: "public",
        handleUploadUrl: `/api/pitches/${id}/upload-token`,
        contentType: body.type || file.type,
      });
      return readJson<{ data: Img }>(
        await fetch(`/api/pitches/${id}/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blobUrl: blob.url }) })
      );
    } catch {
      return { ok: false as const, error: `Could not upload ${file.name}. Try again.` };
    }
  };

  const runDraft = async () => {
    setConfirmDraft(false);
    if (!(await flush())) return;
    setDrafting(true);
    const r = await readJson<{ data: { title: string; sections: PitchSections; stats: PitchStat[]; proof: string[] } }>(
      await fetch(`/api/pitches/${id}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) })
    );
    setDrafting(false);
    if (!r.ok) return toast(r.error!, "error");
    const d = r.data!.data;
    setPitch((p) => (p ? { ...p, title: d.title, sections: d.sections, stats: d.stats, proof: d.proof, notes } : p));
    setSaving("saved");
    toast("Draft written. Read it through and fix anything that isn't right.", "success");
  };
  const askDraft = () => {
    const filled = pitch && Object.values(pitch.sections).some((v) => v && v.trim());
    if (filled) setConfirmDraft(true);
    else runDraft();
  };

  const uploadLogo = async (file: File) => {
    setUploading("logo");
    const r = await sendImage("logo", file, "PUT");
    setUploading(null);
    if (!r.ok) return toast(r.error!, "error");
    setPitch((p) => (p ? { ...p, hasLogo: true } : p));
    setLogoKey((k) => k + 1);
  };
  const removeLogo = async () => {
    const r = await readJson(await fetch(`/api/pitches/${id}/logo`, { method: "DELETE" }));
    if (!r.ok) return toast(r.error!, "error");
    setPitch((p) => (p ? { ...p, hasLogo: false } : p));
  };

  const uploadImages = async (files: FileList) => {
    setUploading("image");
    for (const file of Array.from(files)) {
      const r = await sendImage("images", file, "POST");
      if (!r.ok) { toast(r.error!, "error"); break; }
      setPitch((p) => (p ? { ...p, images: [...p.images, r.data!.data] } : p));
    }
    setUploading(null);
  };
  const saveCaption = async (img: Img, caption: string) => {
    if ((img.caption || "") === caption) return;
    const r = await readJson(await fetch(`/api/pitches/${id}/images/${img.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caption }) }));
    if (!r.ok) return toast(r.error!, "error");
    setPitch((p) => (p ? { ...p, images: p.images.map((i) => (i.id === img.id ? { ...i, caption } : i)) } : p));
  };
  const removeImage = async (img: Img) => {
    const r = await readJson(await fetch(`/api/pitches/${id}/images/${img.id}`, { method: "DELETE" }));
    if (!r.ok) return toast(r.error!, "error");
    setPitch((p) => (p ? { ...p, images: p.images.filter((i) => i.id !== img.id) } : p));
  };

  const remove = async () => {
    setDeleting(true);
    const r = await readJson(await fetch(`/api/pitches/${id}`, { method: "DELETE" }));
    setDeleting(false);
    if (!r.ok) return toast(r.error!, "error");
    pending.current = {};
    router.push("/pitches");
  };

  if (missing) {
    return (
      <div>
        <TopBar title="Pitches" />
        <div className="px-6 py-16 text-center text-sm text-bb-dim">
          This pitch doesn&apos;t exist anymore. <Link href="/pitches" className="text-bb-accent">Back to pitches</Link>
        </div>
      </div>
    );
  }
  if (!pitch) return <div className="py-24 flex justify-center"><Loader2 size={20} className="animate-spin text-bb-dim" /></div>;

  const ro = !pitch.canEdit;
  const internal = pitch.kind === "INTERNAL";
  const stats = pitch.stats.length ? pitch.stats : [];

  return (
    <div>
      <TopBar title={pitch.title} subtitle={`${internal ? "Internal pitch" : "Pitch"} · ${pitch.brandName} · by ${pitch.authorName}`} />
      <div className="px-4 lg:px-6 pb-10 space-y-4">
        {/* action bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/pitches" className={small}><ArrowLeft size={13} /> All pitches</Link>
          <select
            value={pitch.status}
            disabled={ro}
            onChange={(e) => update("status", e.target.value as PitchStatusKey)}
            className={`rounded-lg px-2.5 py-2 text-xs font-semibold border-0 focus:ring-2 focus:ring-bb-blue/50 ${STATUS_STYLE[pitch.status]}`}
          >
            {(Object.keys(STATUS_LABEL) as PitchStatusKey[]).map((s) => <option key={s} value={s} className="bg-bb-black text-white">{STATUS_LABEL[s]}</option>)}
          </select>
          <span className="text-[11px] text-bb-dim min-w-16">
            {ro ? "View only" : saving === "saving" ? "Saving..." : saving === "saved" ? "Saved" : saving === "error" ? "Not saved" : ""}
          </span>
          <div className="flex-1" />
          <button onClick={() => openPdf(false)} className={small}><Eye size={13} /> Preview PDF</button>
          <button onClick={() => openPdf(true)} className="flex items-center gap-1.5 px-3.5 py-2 bg-bb-blue hover:bg-bb-blue-light text-white text-xs font-semibold rounded-lg transition-colors">
            <FileDown size={13} /> Download PDF
          </button>
          {!ro && <button onClick={() => setConfirmDelete(true)} className={`${small} hover:!text-red-400`}><Trash2 size={13} /></button>}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4">
            {/* basics */}
            <div className={card}>
              <h3 className={h3}><Building2 size={14} className="text-bb-accent" /> The pitch</h3>
              <div className="flex rounded-lg border border-bb-border overflow-hidden w-fit">
                {(["BRAND", "INTERNAL"] as const).map((k) => (
                  <button
                    key={k}
                    disabled={ro}
                    onClick={() => update("kind", k)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${pitch.kind === k ? "bg-bb-blue text-white" : "bg-bb-black text-bb-muted hover:text-white"}`}
                  >
                    {k === "BRAND" ? <Building2 size={13} /> : <UserRound size={13} />}
                    {k === "BRAND" ? "To the brand" : "To Chase (internal)"}
                  </button>
                ))}
              </div>
              <Field label="Title on the cover">
                <input className={inputClass} disabled={ro} value={pitch.title} maxLength={140} onChange={(e) => update("title", e.target.value)} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Brand name">
                  <input className={inputClass} disabled={ro} value={pitch.brandName} maxLength={120} onChange={(e) => update("brandName", e.target.value)} />
                </Field>
                <Field label="Their website">
                  <input className={inputClass} disabled={ro} value={pitch.brandWebsite || ""} placeholder="acme.com" maxLength={300} onChange={(e) => update("brandWebsite", e.target.value || null)} />
                </Field>
                <Field label="Industry">
                  <input className={inputClass} disabled={ro} value={pitch.brandIndustry || ""} placeholder="Coffee shop, plumbing, coaching..." maxLength={120} onChange={(e) => update("brandIndustry", e.target.value || null)} />
                </Field>
                <Field label={internal ? "Who it's for" : "Who will read it"}>
                  <input className={inputClass} disabled={ro} value={pitch.recipient || ""} placeholder={internal ? "Chase Haynes" : "Jane Smith, Owner"} maxLength={120} onChange={(e) => update("recipient", e.target.value || null)} />
                </Field>
              </div>
            </div>

            {/* AI draft */}
            <div className={card}>
              <h3 className={h3}><Sparkles size={14} className="text-bb-accent" /> Paste your research, let AI draft it</h3>
              <p className="text-[11px] text-bb-dim -mt-1">
                Notes, links, numbers, reviews, anything you found. The AI only uses what you paste: it won&apos;t make up numbers or prices. You can edit every section after.
              </p>
              <textarea
                className={`${inputClass} min-h-[140px] leading-relaxed`}
                disabled={ro || drafting}
                maxLength={30000}
                value={notes}
                placeholder={"e.g. Their site takes 9.1s to load on mobile (PageSpeed). 4.9 stars, 1,200 Google reviews. No online ordering. Two competitors launched apps this year..."}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={askDraft}
                  disabled={ro || drafting || notes.trim().length < 40}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-bb-blue hover:bg-bb-blue-light text-white text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors"
                >
                  {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {drafting ? "Drafting, about 30 seconds..." : "Draft with AI"}
                </button>
                <span className="text-[11px] text-bb-dim">{notes.length.toLocaleString()} / 30,000</span>
              </div>
            </div>

            {/* research */}
            <div className={card}>
              <h3 className={h3}><PenLine size={14} className="text-bb-accent" /> Your research</h3>
              <p className="text-[11px] text-bb-dim -mt-1">Empty boxes are left out of the PDF. Start a line with - to make a bullet.</p>
              {SECTION_KEYS.map((k) => (
                <Field key={k} label={internal ? SECTION_META[k].internal : SECTION_META[k].brand} hint={SECTION_META[k].hint}>
                  <textarea
                    className={`${inputClass} min-h-[84px] leading-relaxed`}
                    disabled={ro}
                    rows={k === "research" || k === "proposal" ? 6 : 3}
                    maxLength={6000}
                    value={pitch.sections[k] || ""}
                    onChange={(e) => update("sections", { ...pitch.sections, [k]: e.target.value })}
                  />
                </Field>
              ))}
            </div>

            {/* screenshots */}
            <div className={card}>
              <div className="flex items-center justify-between">
                <h3 className={h3}><ImageIcon size={14} className="text-bb-accent" /> Screenshots</h3>
                {!ro && (
                  <>
                    <input ref={imageInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) uploadImages(e.target.files); e.target.value = ""; }} />
                    <button onClick={() => imageInput.current?.click()} disabled={uploading !== null || pitch.images.length >= MAX_IMAGES} className={small}>
                      {uploading === "image" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Add screenshots
                    </button>
                  </>
                )}
              </div>
              {pitch.images.length === 0 ? (
                <p className="text-xs text-bb-dim">Their site on a phone, bad reviews, a competitor doing it better. Up to 20, each up to 25 MB. Two per page in the PDF.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pitch.images.map((img) => (
                    <div key={img.id} className="rounded-lg border border-bb-border overflow-hidden bg-bb-black">
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/pitches/${id}/images/${img.id}`} alt={img.caption || "Research screenshot"} className="w-full h-40 object-contain bg-white" />
                        {!ro && (
                          <button onClick={() => removeImage(img)} className="absolute top-2 right-2 p-1 rounded bg-black/70 text-white hover:text-red-400" aria-label="Remove screenshot">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <input
                        className="w-full px-3 py-2 bg-transparent text-xs text-white placeholder:text-bb-dim focus:outline-none border-t border-bb-border"
                        placeholder="Caption (optional)"
                        defaultValue={img.caption || ""}
                        disabled={ro}
                        maxLength={200}
                        onBlur={(e) => saveCaption(img, e.target.value.trim())}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {/* logo + colour */}
            <div className={card}>
              <h3 className={h3}><Palette size={14} className="text-bb-accent" /> Their brand</h3>
              <div className="rounded-lg bg-white h-32 flex items-center justify-center overflow-hidden">
                {pitch.hasLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={logoKey} src={`/api/pitches/${id}/logo?v=${logoKey}`} alt={`${pitch.brandName} logo`} className="max-h-24 max-w-[80%] object-contain" />
                ) : (
                  <span className="text-sm font-semibold text-neutral-800 px-4 text-center">{pitch.brandName}</span>
                )}
              </div>
              {!ro && (
                <div className="flex flex-wrap gap-2">
                  <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
                  <button onClick={() => logoInput.current?.click()} disabled={uploading !== null} className={small}>
                    {uploading === "logo" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {pitch.hasLogo ? "Replace logo" : "Upload their logo"}
                  </button>
                  {pitch.hasLogo && <button onClick={removeLogo} className={small}><X size={13} /> Remove</button>}
                </div>
              )}
              <p className="text-[11px] text-bb-dim">PNG or SVG with a transparent background looks best, up to 25 MB. No logo? Their name is used.</p>
              <Field label="Accent colour (optional)" hint="Their main brand colour, used for the stripes and bullets.">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    disabled={ro}
                    value={pitch.brandColor || "#2561d8"}
                    onChange={(e) => update("brandColor", e.target.value)}
                    className="h-9 w-12 rounded border border-bb-border bg-bb-black cursor-pointer disabled:cursor-default"
                  />
                  <span className="text-xs text-bb-muted font-mono">{pitch.brandColor || "Blok Blok blue"}</span>
                  {pitch.brandColor && !ro && <button onClick={() => update("brandColor", null)} className="text-[11px] text-bb-dim hover:text-white">Reset</button>}
                </div>
              </Field>
            </div>

            {/* numbers */}
            <div className={card}>
              <div className="flex items-center justify-between">
                <h3 className={h3}><Hash size={14} className="text-bb-accent" /> Key numbers</h3>
                {!ro && stats.length < 4 && (
                  <button onClick={() => update("stats", [...stats, { value: "", label: "", source: "" }])} className={small}><Plus size={13} /> Add</button>
                )}
              </div>
              {stats.length === 0 && <p className="text-xs text-bb-dim">Up to 4 big numbers from your research, like &quot;9.1s&quot; load time or &quot;4.9&quot; stars.</p>}
              {stats.map((s, i) => {
                const set = (patch: Partial<PitchStat>) => update("stats", stats.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="rounded-lg border border-bb-border p-2.5 space-y-2">
                    <div className="flex gap-2">
                      <input className={`${inputClass.replace("w-full ", "")} w-24 shrink-0 font-semibold`} disabled={ro} placeholder="9.1s" maxLength={24} value={s.value} onChange={(e) => set({ value: e.target.value })} />
                      <input className={`${inputClass} flex-1 min-w-0`} disabled={ro} placeholder="What it measures" maxLength={80} value={s.label} onChange={(e) => set({ label: e.target.value })} />
                      {!ro && <button onClick={() => update("stats", stats.filter((_, j) => j !== i))} className="text-bb-dim hover:text-red-400 shrink-0" aria-label="Remove number"><X size={14} /></button>}
                    </div>
                    <input className={`${inputClass} text-xs`} disabled={ro} placeholder="Source (optional): PageSpeed Insights, Google reviews..." maxLength={120} value={s.source || ""} onChange={(e) => set({ source: e.target.value })} />
                  </div>
                );
              })}
            </div>

            {/* proof */}
            <div className={card}>
              <h3 className={h3}><Award size={14} className="text-bb-accent" /> Case studies to include</h3>
              <p className="text-[11px] text-bb-dim -mt-1">Confirmed results only. Ask Chase to add a new one.</p>
              {PROOF.map((c) => {
                const on = pitch.proof.includes(c.key);
                return (
                  <button
                    key={c.key}
                    disabled={ro}
                    onClick={() => update("proof", on ? pitch.proof.filter((k) => k !== c.key) : [...pitch.proof, c.key])}
                    className={`w-full text-left flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${on ? "border-bb-blue bg-bb-blue/10" : "border-bb-border hover:border-bb-blue/40"}`}
                  >
                    <span className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-bb-blue border-bb-blue" : "border-bb-border"}`}>
                      {on && <Check size={11} className="text-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-white">{c.client} <span className="text-bb-accent font-semibold">{c.headline}</span></span>
                      <span className="block text-[11px] text-bb-dim">{c.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDraft}
        onClose={() => setConfirmDraft(false)}
        onConfirm={runDraft}
        title="Replace what's written?"
        message="The AI draft replaces the title, every section, the key numbers and the case-study picks. Screenshots and the logo stay."
        confirmLabel="Draft with AI"
        confirmVariant="warning"
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete this pitch?"
        message={`"${pitch.title}" and its screenshots will be removed for everyone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
      />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-bb-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-bb-dim">{hint}</span>}
    </label>
  );
}
