"use client";

import { Instagram, Twitter, Linkedin, Facebook, Youtube, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

const platformConfig: Record<string, { icon: typeof Instagram; color: string; label: string }> = {
  INSTAGRAM: { icon: Instagram, color: "text-pink-400", label: "Instagram" },
  TWITTER: { icon: Twitter, color: "text-sky-400", label: "Twitter/X" },
  LINKEDIN: { icon: Linkedin, color: "text-blue-500", label: "LinkedIn" },
  FACEBOOK: { icon: Facebook, color: "text-blue-400", label: "Facebook" },
  YOUTUBE: { icon: Youtube, color: "text-red-500", label: "YouTube" },
  TIKTOK: { icon: Music2, color: "text-cyan-400", label: "TikTok" },
};

export const PLATFORM_COLORS: Record<string, string> = {
  INSTAGRAM: "bg-pink-400",
  TWITTER: "bg-sky-400",
  LINKEDIN: "bg-blue-500",
  FACEBOOK: "bg-blue-400",
  YOUTUBE: "bg-red-500",
  TIKTOK: "bg-cyan-400",
};

export default function PlatformIcon({
  platform,
  size = 16,
  className,
}: {
  platform: string;
  size?: number;
  className?: string;
}) {
  const config = platformConfig[platform] || platformConfig.TWITTER;
  const Icon = config.icon;
  return <Icon size={size} className={cn(config.color, className)} />;
}

export function getPlatformLabel(platform: string): string {
  return platformConfig[platform]?.label || platform;
}
