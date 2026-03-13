"use client";

import { useState, useEffect } from "react";
import { Clock, TrendingUp } from "lucide-react";
import PlatformIcon from "./PlatformIcon";

interface BestTime {
  day: number;
  hour: number;
  label: string;
  count: number;
  source: "historical" | "recommended";
}

export default function BestTimes({ platform }: { platform: string | null }) {
  const [times, setTimes] = useState<BestTime[]>([]);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!platform) {
      setTimes([]);
      return;
    }

    setLoading(true);
    fetch(`/api/content-posts/best-times?platform=${platform}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setTimes(data.data);
          setSource(data.source);
        }
      })
      .finally(() => setLoading(false));
  }, [platform]);

  if (!platform || loading) return null;
  if (times.length === 0) return null;

  return (
    <div className="bg-bb-surface border border-bb-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-bb-orange" />
        <h3 className="text-sm font-semibold text-white">Best Times to Post</h3>
        <PlatformIcon platform={platform} size={12} />
      </div>
      <p className="text-[11px] text-bb-dim mb-3">
        {source === "historical"
          ? "Based on your publishing history"
          : "Industry-recommended times (UTC)"}
      </p>
      <div className="flex flex-wrap gap-2">
        {times.map((t) => (
          <div
            key={`${t.day}-${t.hour}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-bb-elevated rounded-lg border border-bb-border text-xs"
          >
            <Clock size={10} className="text-bb-orange" />
            <span className="text-white">{t.label}</span>
            {t.source === "historical" && t.count > 0 && (
              <span className="text-bb-dim">({t.count}x)</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
