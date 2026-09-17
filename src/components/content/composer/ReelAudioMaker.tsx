"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard, Loader2, Music, Upload } from "lucide-react";
import { uploadFile } from "@/lib/client-upload";
import { readJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";
import type { MediaMeta } from "./types";
import { metaFromClientMedia } from "./media";
import { FieldLabel, inputClass } from "./ui";

interface AudioFile {
  id: string;
  url: string;
  filename: string;
}

interface Props {
  clientId: string;
  /** The post's photos, in slide order */
  imageUrls: string[];
  /** Called with the finished video, already saved to the client's library */
  onCreated: (video: MediaMeta) => void;
}

/** Must match the label the slideshow route saves on the finished video. */
const REEL_LABEL = "Reel made from photos + audio";

const SLIDE_LENGTHS = [
  { value: "2", label: "2 seconds per photo" },
  { value: "3", label: "3 seconds per photo" },
  { value: "4", label: "4 seconds per photo" },
  { value: "5", label: "5 seconds per photo" },
  { value: "match", label: "Spread photos across the whole track" },
];

/**
 * Instagram and Facebook can't add audio to a carousel through the API, so the
 * photos are rendered into one vertical video with the track over it, and that
 * video posts as a Reel.
 */
export default function ReelAudioMaker({ clientId, imageUrls, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<AudioFile[]>([]);
  const [audio, setAudio] = useState<AudioFile | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [slideLength, setSlideLength] = useState("3");
  const [fit, setFit] = useState<"pad" | "crop">("pad");
  const [audioStart, setAudioStart] = useState("0");
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !clientId) return;
    let cancelled = false;
    fetch(`/api/client-media?clientId=${encodeURIComponent(clientId)}&fileType=AUDIO`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.success) setLibrary(d.data as AudioFile[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  const handleUpload = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|wav|aac|ogg)$/i.test(file.name)) {
      setError(`${file.name} isn't an audio file. Use an MP3, M4A or WAV.`);
      return;
    }
    setUploadPct(0);
    try {
      const { url } = await uploadFile(file, { onProgress: (loaded, total) => setUploadPct(total ? Math.round((loaded / total) * 100) : 0) });
      // Save it to the client's library so it can be reused on the next post
      const res = await fetch("/api/client-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, url, filename: file.name, fileType: file.type || "audio/mpeg", fileSize: file.size }),
      });
      const json = await readJson<{ data?: AudioFile[] }>(res);
      const record = json.ok ? json.data?.data?.[0] : undefined;
      const added = record || { id: url, url, filename: file.name };
      setLibrary((l) => [added, ...l]);
      setAudio(added);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn't upload ${file.name}.`);
    } finally {
      setUploadPct(null);
    }
  };

  /**
   * A phone that locks or switches apps mid-render drops the request, but the
   * server carries on and saves the video. Look for it in the library rather
   * than showing an error for something that worked.
   */
  const findFinishedReel = async (startedAt: number): Promise<Parameters<typeof metaFromClientMedia>[0] | null> => {
    for (let attempt = 0; attempt < 24; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/client-media?clientId=${encodeURIComponent(clientId)}&fileType=VIDEO`);
        const d = await res.json();
        const hit = (d?.data as { url: string; label?: string | null; createdAt: string }[] | undefined)?.find(
          (m) => m.label === REEL_LABEL && new Date(m.createdAt).getTime() >= startedAt - 5000
        );
        if (hit) return hit;
      } catch {
        /* still offline, keep waiting */
      }
    }
    return null;
  };

  const create = async () => {
    if (!audio) return;
    setError(null);
    setRendering(true);
    const startedAt = Date.now();
    try {
      let record: Parameters<typeof metaFromClientMedia>[0] | null | undefined;
      let failure: string | null = null;
      let dropped = false;
      try {
        const res = await fetch("/api/client-media/slideshow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            imageUrls,
            audioUrl: audio.url,
            secondsPerSlide: slideLength === "match" ? "match" : Number(slideLength),
            fit,
            audioStart: Number(audioStart) || 0,
          }),
        });
        const json = await readJson<{ data?: Parameters<typeof metaFromClientMedia>[0] }>(res);
        record = json.ok ? json.data?.data : undefined;
        if (!record) {
          failure = json.error;
          dropped = res.status === 504;
        }
      } catch {
        dropped = true;
      }
      if (!record && dropped) record = await findFinishedReel(startedAt);
      if (!record) throw new Error(failure || "Couldn't make the video. Check your connection and try again.");
      onCreated(metaFromClientMedia(record));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the video. Try again.");
    } finally {
      setRendering(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-3 sm:py-2.5 rounded-lg border border-bb-border text-sm text-bb-muted hover:text-white hover:border-bb-orange/50 cursor-pointer transition-colors"
      >
        <Music size={14} /> Add audio and post as a Reel
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-bb-border bg-bb-elevated p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-white">
            <Clapperboard size={14} className="text-bb-orange" /> Photos with audio, posted as a Reel
          </p>
          <p className="text-[11px] text-bb-dim mt-1">
            Instagram and Facebook can&apos;t add audio to a carousel from a scheduling tool, so {imageUrls.length === 1 ? "this photo becomes" : `these ${imageUrls.length} photos become`} one
            vertical video with your track over it. Use audio you have the rights to; Instagram&apos;s in-app music isn&apos;t available here.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(false)} disabled={rendering} className="p-2 -m-2 text-xs sm:text-[11px] text-bb-dim hover:text-white cursor-pointer transition-colors shrink-0">
          Cancel
        </button>
      </div>

      <div>
        <FieldLabel htmlFor="reel-audio">Audio</FieldLabel>
        <div className="flex gap-2">
          <select
            id="reel-audio"
            value={audio?.id || ""}
            disabled={rendering || uploadPct !== null}
            onChange={(e) => setAudio(library.find((a) => a.id === e.target.value) || null)}
            className={cn(inputClass, "flex-1 min-w-0")}
          >
            <option value="">{library.length ? "Choose from the client's library" : "No audio in the client's library yet"}</option>
            {library.map((a) => (
              <option key={a.id} value={a.id}>
                {a.filename}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={rendering || uploadPct !== null}
            onClick={() => inputRef.current?.click()}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 rounded-lg border border-dashed border-bb-border text-sm text-bb-muted hover:text-white hover:border-bb-orange/50 cursor-pointer transition-colors disabled:opacity-40"
          >
            {uploadPct !== null ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploadPct !== null ? `${uploadPct}%` : "Upload"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.aac"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </div>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        {audio && <audio key={audio.url} controls preload="none" src={audio.url} className="mt-2 w-full h-9" />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2">
          <FieldLabel htmlFor="reel-length">Photo timing</FieldLabel>
          <select id="reel-length" value={slideLength} disabled={rendering} onChange={(e) => setSlideLength(e.target.value)} className={inputClass}>
            {SLIDE_LENGTHS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="reel-start">Start audio at (sec)</FieldLabel>
          <input id="reel-start" type="number" min={0} step={1} inputMode="numeric" value={audioStart} disabled={rendering} onChange={(e) => setAudioStart(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <FieldLabel>Photos that aren&apos;t vertical</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "pad", label: "Show the whole photo", hint: "black bars" },
              { value: "crop", label: "Fill the screen", hint: "crops the edges" },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={rendering}
              onClick={() => setFit(o.value)}
              className={cn(
                "px-3 py-2 rounded-lg border text-left text-xs cursor-pointer transition-colors",
                fit === o.value ? "border-bb-orange/60 text-white bg-bb-orange/10" : "border-bb-border text-bb-muted hover:text-white"
              )}
            >
              {o.label}
              <span className="block text-[10px] text-bb-dim">{o.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        disabled={!audio || rendering || uploadPct !== null}
        onClick={create}
        className="w-full flex items-center justify-center gap-2 px-3 py-3 sm:py-2.5 rounded-lg bg-bb-orange text-white text-sm font-medium cursor-pointer transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {rendering ? <Loader2 size={14} className="animate-spin" /> : <Clapperboard size={14} />}
        {rendering ? "Making the video, usually under a minute" : "Make the Reel video"}
      </button>
      <p className="text-[11px] text-bb-dim">The video replaces the photos on this post. The photos stay in the client&apos;s library.</p>
    </div>
  );
}
