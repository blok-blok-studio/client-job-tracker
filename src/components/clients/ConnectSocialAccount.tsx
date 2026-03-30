"use client";

import { useState } from "react";
import { Link2, Instagram, Twitter, Linkedin, Youtube, AtSign, Facebook, ChevronDown } from "lucide-react";

const PROVIDERS = [
  {
    key: "meta",
    label: "Instagram / Facebook / Threads",
    icon: Instagram,
    color: "text-pink-400",
    description: "Connects Instagram Business, Facebook Pages, and Threads",
  },
  {
    key: "twitter",
    label: "X (Twitter)",
    icon: Twitter,
    color: "text-white",
    description: "Post tweets with text, images, and video",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    color: "text-blue-500",
    description: "Publish posts to LinkedIn profiles",
  },
  {
    key: "google",
    label: "YouTube",
    icon: Youtube,
    color: "text-red-500",
    description: "Upload videos to YouTube channels",
  },
];

export default function ConnectSocialAccount({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);

  const handleConnect = (providerKey: string) => {
    // Redirect to OAuth authorize endpoint
    window.location.href = `/api/oauth/${providerKey}/authorize?clientId=${clientId}`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
      >
        <Link2 size={14} />
        Connect Account
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-bb-surface border border-bb-border rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-bb-border">
              <h3 className="text-sm font-semibold text-white">Connect Social Account</h3>
              <p className="text-[11px] text-bb-dim mt-0.5">Authorize access to post on behalf of this client</p>
            </div>

            <div className="p-2">
              {PROVIDERS.map((provider) => {
                const Icon = provider.icon;
                return (
                  <button
                    key={provider.key}
                    onClick={() => {
                      setOpen(false);
                      handleConnect(provider.key);
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-bb-elevated transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-bb-elevated flex items-center justify-center border border-bb-border">
                      <Icon size={16} className={provider.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{provider.label}</p>
                      <p className="text-[10px] text-bb-dim">{provider.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="px-4 py-2.5 border-t border-bb-border">
              <p className="text-[10px] text-bb-dim">
                You&apos;ll be redirected to authorize. Tokens are encrypted and auto-refreshed.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
