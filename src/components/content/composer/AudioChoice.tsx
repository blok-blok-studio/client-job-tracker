"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { uploadFile } from "@/lib/client-upload";
import { readJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";
import { FieldLabel, inputClass } from "./ui";

export interface AudioFile {
  id: string;
  url: string;
  filename: string;
}

interface Props {
  id: string;
  clientId: string;
  value: AudioFile | null;
  disabled?: boolean;
  onChange: (audio: AudioFile | null) => void;
  onError: (message: string | null) => void;
  /** True while a file is uploading, so the parent can hold its own button */
  onBusy?: (busy: boolean) => void;
}

/** Pick a track: the client's own audio, the team's uploaded MP3s (Content > Audio), or a new upload. */
export default function AudioChoice({ id, clientId, value, disabled, onChange, onError, onBusy }: Props) {
  const [clientAudio, setClientAudio] = useState<AudioFile[]>([]);
  const [teamAudio, setTeamAudio] = useState<AudioFile[]>([]);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    fetch(`/api/client-media?clientId=${encodeURIComponent(clientId)}&fileType=AUDIO`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.success) setClientAudio(d.data as AudioFile[]);
      })
      .catch(() => {});
    fetch("/api/audio-tracks?source=upload")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.success) setTeamAudio((d.data as { id: string; url: string; title: string }[]).map((t) => ({ id: `track:${t.id}`, url: t.url, filename: t.title })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const handleUpload = async (file: File) => {
    onError(null);
    if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|wav|aac|ogg)$/i.test(file.name)) {
      onError(`${file.name} isn't an audio file. Use an MP3, M4A or WAV.`);
      return;
    }
    setUploadPct(0);
    onBusy?.(true);
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
      setClientAudio((l) => [added, ...l]);
      onChange(added);
    } catch (err) {
      onError(err instanceof Error ? err.message : `Couldn't upload ${file.name}.`);
    } finally {
      setUploadPct(null);
      onBusy?.(false);
    }
  };

  const all = [...clientAudio, ...teamAudio];
  const busy = disabled || uploadPct !== null;

  return (
    <div>
      <FieldLabel htmlFor={id}>Audio</FieldLabel>
      <div className="flex gap-2">
        <select
          id={id}
          value={value?.id || ""}
          disabled={busy}
          onChange={(e) => onChange(all.find((a) => a.id === e.target.value) || null)}
          className={cn(inputClass, "flex-1 min-w-0")}
        >
          <option value="">{all.length ? "Choose a track" : "No audio uploaded yet"}</option>
          {clientAudio.length > 0 && (
            <optgroup label="This client's library">
              {clientAudio.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.filename}
                </option>
              ))}
            </optgroup>
          )}
          {teamAudio.length > 0 && (
            <optgroup label="Uploaded MP3s (Content, Audio tab)">
              {teamAudio.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.filename}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          type="button"
          disabled={busy}
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
      {value && <audio key={value.url} controls preload="none" src={value.url} className="mt-2 w-full h-9" />}
    </div>
  );
}
