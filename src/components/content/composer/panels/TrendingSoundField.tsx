"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Hand, TrendingUp } from "lucide-react";
import { readAssignedSound, type AssignedSound, type SoundPlatform } from "@/lib/trending-sound";
import { FieldLabel, inputClass } from "../ui";
import type { PanelProps } from "./shared";

interface SavedSound {
  id: string;
  name: string;
  artist: string | null;
  url: string;
  platform: SoundPlatform;
  client: { id: string; name: string } | null;
}

/**
 * Assign a saved trending sound (Content > Audio) to this post. The platforms
 * don't take their in-app sounds through the API, so choosing one switches the
 * account to Post manually (TikTok: to drafts); the handoff page then opens the
 * sound in the app.
 */
export default function TrendingSoundField({ draft, disabled, onDraft, onSettings, platform }: Pick<PanelProps, "draft" | "disabled" | "onDraft" | "onSettings"> & { platform: SoundPlatform }) {
  const [sounds, setSounds] = useState<SavedSound[]>([]);
  const assigned = readAssignedSound(draft.settings);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trending-sounds?platform=${platform}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.success) setSounds(d.data as SavedSound[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [platform]);

  // The post keeps its own copy, so a sound archived or deleted since still shows
  const options: (SavedSound | AssignedSound)[] = assigned && !sounds.some((s) => s.id === assigned.id) ? [assigned, ...sounds] : sounds;

  const choose = (id: string) => {
    const s = options.find((o) => o.id === id);
    if (!s) {
      onSettings({ trendingSound: undefined });
      return;
    }
    onSettings({ trendingSound: { id: s.id, name: s.name, artist: s.artist || undefined, url: s.url, platform: s.platform } });
    if (draft.publishMode !== "AUTO" || draft.settings.tiktokDraft === true) return;
    // TikTok can take the video as a draft, so only the sound is left to do by hand
    if (platform === "TIKTOK") onSettings({ tiktokDraft: true });
    else onDraft({ publishMode: "ASSISTED" });
  };

  return (
    <div>
      <FieldLabel htmlFor={`sound-${draft.key}`} hint="Optional">
        <span className="inline-flex items-center gap-1">
          <TrendingUp size={11} className="text-bb-orange" /> Trending sound
        </span>
      </FieldLabel>
      <select id={`sound-${draft.key}`} value={assigned?.id || ""} disabled={disabled} onChange={(e) => choose(e.target.value)} className={inputClass}>
        <option value="">{options.length ? "None" : "None saved yet. Add them in Content, Audio tab"}</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.artist ? ` · ${s.artist}` : ""}
            {"client" in s && s.client ? ` (${s.client.name})` : ""}
          </option>
        ))}
      </select>
      {assigned && (
        <div className="mt-1.5 space-y-1">
          <a href={assigned.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-bb-orange hover:text-bb-orange-light">
            Open the sound <ExternalLink size={10} />
          </a>
          {draft.settings.tiktokDraft === true ? (
            <p className="flex items-start gap-1.5 text-[11px] text-bb-dim">
              <Hand size={11} className="mt-px shrink-0 text-bb-orange" />
              The app is the only place this sound can be added, so this goes to TikTok as a draft. Whoever finishes it gets the sound link in the reminder.
            </p>
          ) : draft.publishMode === "ASSISTED" ? (
            <p className="flex items-start gap-1.5 text-[11px] text-bb-dim">
              <Hand size={11} className="mt-px shrink-0 text-bb-orange" />
              The app is the only place this sound can be added, so this account is set to Post manually. Whoever posts it gets the sound link with everything else.
            </p>
          ) : (
            <p className="text-[11px] text-amber-300">Publishing automatically will post this without the sound. Switch to {platform === "TIKTOK" ? "Send to TikTok drafts or " : ""}Post manually to use it.</p>
          )}
        </div>
      )}
    </div>
  );
}
