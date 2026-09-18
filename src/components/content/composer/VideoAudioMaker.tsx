"use client";

import { useState } from "react";
import { Loader2, Music } from "lucide-react";
import { readJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";
import type { MediaMeta } from "./types";
import { metaFromClientMedia } from "./media";
import { FieldLabel, inputClass } from "./ui";
import AudioChoice, { type AudioFile } from "./AudioChoice";

interface Props {
  clientId: string;
  videoUrl: string;
  /** Called with the finished video, already saved to the client's library */
  onCreated: (video: MediaMeta) => void;
}

/** Must match the label the audio-mix route saves on the finished video. */
const MIX_LABEL = "Video with added audio";

/**
 * Lays an uploaded track over the post's video. The result is an ordinary
 * video in the client's library, so it publishes automatically like any other.
 */
export default function VideoAudioMaker({ clientId, videoUrl, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [audio, setAudio] = useState<AudioFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [trackVolume, setTrackVolume] = useState(60);
  const [audioStart, setAudioStart] = useState("0");
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A phone that locks mid-render drops the request while the server finishes: look for the saved video
  const findFinished = async (startedAt: number): Promise<Parameters<typeof metaFromClientMedia>[0] | null> => {
    for (let attempt = 0; attempt < 24; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/client-media?clientId=${encodeURIComponent(clientId)}&fileType=VIDEO`);
        const d = await res.json();
        const hit = (d?.data as { url: string; label?: string | null; createdAt: string }[] | undefined)?.find(
          (m) => m.label === MIX_LABEL && new Date(m.createdAt).getTime() >= startedAt - 5000
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
        const res = await fetch("/api/client-media/audio-mix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            videoUrl,
            audioUrl: audio.url,
            keepOriginal,
            trackVolume: keepOriginal ? trackVolume / 100 : 1,
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
      if (!record && dropped) record = await findFinished(startedAt);
      if (!record) throw new Error(failure || "Couldn't add the audio. Check your connection and try again.");
      onCreated(metaFromClientMedia(record));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the audio. Try again.");
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
        <Music size={14} /> Add an MP3 to this video
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-bb-border bg-bb-elevated p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-white">
            <Music size={14} className="text-bb-orange" /> Add an MP3 to this video
          </p>
          <p className="text-[11px] text-bb-dim mt-1">
            The track is baked into the video, so it still publishes automatically. The picture isn&apos;t touched. Use audio you have the rights to. It posts as
            original audio, not as a trending sound.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(false)} disabled={rendering} className="p-2 -m-2 text-xs sm:text-[11px] text-bb-dim hover:text-white cursor-pointer transition-colors shrink-0">
          Cancel
        </button>
      </div>

      <AudioChoice id="video-audio" clientId={clientId} value={audio} disabled={rendering} onChange={setAudio} onError={setError} onBusy={setUploading} />

      <div>
        <FieldLabel>The video&apos;s own sound</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: false, label: "Replace it", hint: "only the track plays" },
              { value: true, label: "Keep it", hint: "track plays underneath" },
            ] as const
          ).map((o) => (
            <button
              key={String(o.value)}
              type="button"
              disabled={rendering}
              onClick={() => setKeepOriginal(o.value)}
              className={cn(
                "px-3 py-2 rounded-lg border text-left text-xs cursor-pointer transition-colors",
                keepOriginal === o.value ? "border-bb-orange/60 text-white bg-bb-orange/10" : "border-bb-border text-bb-muted hover:text-white"
              )}
            >
              {o.label}
              <span className="block text-[10px] text-bb-dim">{o.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {keepOriginal && (
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="video-audio-volume" hint={`${trackVolume}%`}>
              Track volume
            </FieldLabel>
            <input
              id="video-audio-volume"
              type="range"
              min={5}
              max={100}
              step={5}
              value={trackVolume}
              disabled={rendering}
              onChange={(e) => setTrackVolume(Number(e.target.value))}
              className="w-full h-9 accent-bb-orange cursor-pointer"
            />
          </div>
        )}
        <div>
          <FieldLabel htmlFor="video-audio-start">Start audio at (sec)</FieldLabel>
          <input id="video-audio-start" type="number" min={0} step={1} inputMode="numeric" value={audioStart} disabled={rendering} onChange={(e) => setAudioStart(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        disabled={!audio || rendering || uploading}
        onClick={create}
        className="w-full flex items-center justify-center gap-2 px-3 py-3 sm:py-2.5 rounded-lg bg-bb-orange text-white text-sm font-medium cursor-pointer transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {rendering ? <Loader2 size={14} className="animate-spin" /> : <Music size={14} />}
        {rendering ? "Adding the audio, usually under a minute" : "Add the audio"}
      </button>
      <p className="text-[11px] text-bb-dim">The new video replaces this one on the post. The original stays in the client&apos;s library.</p>
    </div>
  );
}
