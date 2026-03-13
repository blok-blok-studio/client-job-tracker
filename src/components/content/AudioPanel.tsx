"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Music,
  Search,
  Loader2,
  Play,
  Pause,
  Plus,
  Upload,
  Film,
  X,
  Sliders,
  Wand2,
} from "lucide-react";

interface AudioTrack {
  id: string;
  title: string;
  artist?: string;
  genre?: string;
  mood?: string;
  duration: number;
  url: string;
  previewUrl?: string;
  source: string;
  tags?: string[];
}

interface AudioPanelProps {
  videoUrl?: string; // Current video to mix with
  onAudioSelected: (audioUrl: string) => void;
  onMixComplete: (mixedVideoUrl: string) => void;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const GENRES = ["", "beats", "classical", "electronic", "hip hop", "jazz", "lofi", "pop", "rock", "ambient"];
const MOODS = ["", "calm", "chill", "dark", "energetic", "epic", "funny", "happy", "inspiring", "romantic", "sad"];

export default function AudioPanel({ videoUrl, onAudioSelected, onMixComplete }: AudioPanelProps) {
  const [tab, setTab] = useState<"browse" | "upload" | "mix">("browse");
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("");
  const [mood, setMood] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Mix settings
  const [mixing, setMixing] = useState(false);
  const [videoVolume, setVideoVolume] = useState(0.7);
  const [audioVolume, setAudioVolume] = useState(0.5);
  const [audioStart, setAudioStart] = useState(0);
  const [outputQuality, setOutputQuality] = useState("1080p");
  const [outputFps, setOutputFps] = useState(30);
  const [mixError, setMixError] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const searchTracks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (genre) params.set("genre", genre);
      if (mood) params.set("mood", mood);

      const res = await fetch(`/api/audio-tracks/search?${params}`);
      const data = await res.json();
      if (data.success) setTracks(data.data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [search, genre, mood]);

  useEffect(() => {
    if (tab === "browse") searchTracks();
  }, [tab, searchTracks]);

  const playPreview = (track: AudioTrack) => {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) audioRef.current.pause();

    const audio = new Audio(track.previewUrl || track.url);
    audio.play();
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;
    setPlayingId(track.id);
  };

  const selectTrack = (track: AudioTrack) => {
    setSelectedTrack(track);
    onAudioSelected(track.url);
    if (videoUrl) setTab("mix");
  };

  const handleUploadAudio = async (files: FileList) => {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("files", file);
      const uploadRes = await fetch("/api/uploads", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();

      if (uploadData.success && uploadData.urls?.[0]) {
        const url = uploadData.urls[0];
        // Save as audio track
        await fetch("/api/audio-tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: uploadTitle || file.name.replace(/\.[^/.]+$/, ""),
            url,
            source: "upload",
            duration: 0,
          }),
        });

        setSelectedTrack({
          id: "uploaded",
          title: uploadTitle || file.name,
          url,
          duration: 0,
          source: "upload",
        });
        onAudioSelected(url);
        setUploadTitle("");
        if (videoUrl) setTab("mix");
      }
    } catch { /* silent */ } finally {
      setUploading(false);
    }
  };

  const handleMix = async () => {
    if (!videoUrl || !selectedTrack) return;
    setMixing(true);
    setMixError(null);

    try {
      const res = await fetch("/api/audio-mix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl,
          audioUrl: selectedTrack.url,
          videoVolume,
          audioVolume,
          audioStart,
          outputQuality,
          fps: outputFps,
        }),
      });

      const data = await res.json();

      if (data.success) {
        onMixComplete(data.data.url);
      } else {
        setMixError(data.error || "Mix failed");
      }
    } catch {
      setMixError("Mix failed. Please try again.");
    } finally {
      setMixing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 p-0.5 bg-bb-elevated rounded-lg">
        {[
          { key: "browse" as const, label: "Browse Music", icon: Search },
          { key: "upload" as const, label: "Upload Audio", icon: Upload },
          { key: "mix" as const, label: "Mix & Export", icon: Sliders },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === t.key
                ? "bg-bb-surface text-white shadow-sm"
                : "text-bb-dim hover:text-bb-muted"
            }`}
          >
            <t.icon size={12} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Selected track indicator */}
      {selectedTrack && (
        <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <Music size={14} className="text-green-400" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white font-medium truncate">{selectedTrack.title}</p>
            {selectedTrack.artist && <p className="text-[10px] text-green-400/70">{selectedTrack.artist}</p>}
          </div>
          <button type="button" onClick={() => setSelectedTrack(null)} className="text-green-400/50 hover:text-white">
            <X size={12} />
          </button>
        </div>
      )}

      {/* ─── BROWSE TAB ─────────────────────────────────────────────────── */}
      {tab === "browse" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bb-dim" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchTracks()}
                placeholder="Search music..."
                className="w-full bg-bb-elevated border border-bb-border rounded-lg pl-8 pr-3 py-1.5 text-white text-xs placeholder:text-bb-dim"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="flex-1 bg-bb-elevated border border-bb-border rounded-lg px-2 py-1 text-xs text-white"
            >
              <option value="">All Genres</option>
              {GENRES.filter(Boolean).map((g) => (
                <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
              ))}
            </select>
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              className="flex-1 bg-bb-elevated border border-bb-border rounded-lg px-2 py-1 text-xs text-white"
            >
              <option value="">All Moods</option>
              {MOODS.filter(Boolean).map((m) => (
                <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Track list */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="text-bb-orange animate-spin" />
            </div>
          ) : tracks.length === 0 ? (
            <div className="text-center py-8">
              <Music size={28} className="text-bb-dim mx-auto mb-2" />
              <p className="text-xs text-bb-dim">
                {search || genre || mood
                  ? "No tracks found. Try different search terms."
                  : "Add PIXABAY_API_KEY to .env to browse royalty-free music, or upload your own."}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
              {tracks.map((track) => (
                <div
                  key={track.id}
                  className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors cursor-pointer ${
                    selectedTrack?.id === track.id
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-bb-border/50 bg-bb-elevated/50 hover:bg-bb-elevated"
                  }`}
                >
                  {/* Play button */}
                  <button
                    type="button"
                    onClick={() => playPreview(track)}
                    className="w-8 h-8 rounded-full bg-bb-surface border border-bb-border flex items-center justify-center shrink-0 hover:bg-bb-elevated transition-colors"
                  >
                    {playingId === track.id ? (
                      <Pause size={12} className="text-bb-orange" />
                    ) : (
                      <Play size={12} className="text-white ml-0.5" />
                    )}
                  </button>

                  {/* Track info */}
                  <div className="flex-1 min-w-0" onClick={() => selectTrack(track)}>
                    <p className="text-xs text-white font-medium truncate">{track.title}</p>
                    <div className="flex items-center gap-2 text-[10px] text-bb-dim">
                      {track.artist && <span>{track.artist}</span>}
                      {track.duration > 0 && <span>{formatDuration(track.duration)}</span>}
                      {track.genre && (
                        <span className="px-1.5 py-0.5 bg-bb-border/50 rounded text-[9px]">{track.genre}</span>
                      )}
                    </div>
                  </div>

                  {/* Select button */}
                  <button
                    type="button"
                    onClick={() => selectTrack(track)}
                    className="p-1.5 rounded-md hover:bg-bb-surface text-bb-dim hover:text-white transition-colors"
                    title="Use this track"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── UPLOAD TAB ─────────────────────────────────────────────────── */}
      {tab === "upload" && (
        <div className="space-y-3">
          <input
            type="text"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="Track title (optional)..."
            className="w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-bb-dim"
          />
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center gap-2 py-8 border-2 border-dashed border-bb-border rounded-lg hover:border-bb-muted transition-colors"
          >
            {uploading ? (
              <Loader2 size={24} className="text-bb-orange animate-spin" />
            ) : (
              <>
                <Upload size={24} className="text-bb-muted" />
                <p className="text-xs text-bb-dim">
                  Upload MP3, WAV, OGG, or M4A
                </p>
              </>
            )}
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                handleUploadAudio(e.target.files);
                e.target.value = "";
              }
            }}
          />
        </div>
      )}

      {/* ─── MIX TAB ────────────────────────────────────────────────────── */}
      {tab === "mix" && (
        <div className="space-y-4">
          {!videoUrl && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-200">
              Upload a video first, then come back to mix audio.
            </div>
          )}

          {!selectedTrack && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-200">
              Select or upload an audio track first.
            </div>
          )}

          {videoUrl && selectedTrack && (
            <>
              {/* Volume controls */}
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-bb-muted flex items-center gap-1.5">
                      <Film size={12} /> Original Video Audio
                    </label>
                    <span className="text-[10px] text-bb-dim font-mono">{Math.round(videoVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={videoVolume}
                    onChange={(e) => setVideoVolume(Number(e.target.value))}
                    className="w-full h-1.5 bg-bb-border rounded-full appearance-none cursor-pointer accent-bb-orange"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-bb-muted flex items-center gap-1.5">
                      <Music size={12} /> Music Volume
                    </label>
                    <span className="text-[10px] text-bb-dim font-mono">{Math.round(audioVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audioVolume}
                    onChange={(e) => setAudioVolume(Number(e.target.value))}
                    className="w-full h-1.5 bg-bb-border rounded-full appearance-none cursor-pointer accent-green-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-bb-muted">Music Start Offset</label>
                    <span className="text-[10px] text-bb-dim font-mono">{audioStart}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    step="0.5"
                    value={audioStart}
                    onChange={(e) => setAudioStart(Number(e.target.value))}
                    className="w-full h-1.5 bg-bb-border rounded-full appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
              </div>

              {/* Export settings */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-bb-dim mb-1 block">Quality</label>
                  <select
                    value={outputQuality}
                    onChange={(e) => setOutputQuality(e.target.value)}
                    className="w-full bg-bb-elevated border border-bb-border rounded-lg px-2 py-1.5 text-white text-sm"
                  >
                    <option value="720p">720p HD</option>
                    <option value="1080p">1080p Full HD</option>
                    <option value="1440p">1440p QHD</option>
                    <option value="4k">4K Ultra HD</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-bb-dim mb-1 block">Frame Rate</label>
                  <select
                    value={outputFps}
                    onChange={(e) => setOutputFps(Number(e.target.value))}
                    className="w-full bg-bb-elevated border border-bb-border rounded-lg px-2 py-1.5 text-white text-sm"
                  >
                    <option value={24}>24 fps (Film)</option>
                    <option value={30}>30 fps (Standard)</option>
                    <option value={60}>60 fps (Smooth)</option>
                    <option value={90}>90 fps (Ultra)</option>
                  </select>
                </div>
              </div>

              {mixError && (
                <p className="text-xs text-red-400">{mixError}</p>
              )}

              {/* Mix button */}
              <button
                type="button"
                onClick={handleMix}
                disabled={mixing}
                className="w-full py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
              >
                {mixing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Mixing audio into video...
                  </>
                ) : (
                  <>
                    <Wand2 size={14} />
                    Mix & Export Video
                  </>
                )}
              </button>
              <p className="text-[10px] text-bb-dim text-center">
                Video will be re-encoded with music baked in. This may take a moment for 4K content.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
