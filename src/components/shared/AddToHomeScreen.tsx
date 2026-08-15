"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus, Smartphone, X, MoreVertical, Download } from "lucide-react";

// Chrome's install event isn't in the DOM lib types
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | null;

/**
 * "Put this on your phone" card for the public portals (contractor, review,
 * onboard, upload). Device-aware:
 *  - already installed (standalone) → renders nothing
 *  - iOS → Share → Add to Home Screen steps
 *  - Android Chrome → one-tap install via beforeinstallprompt, menu steps as
 *    the fallback
 *  - desktop → renders nothing (the link lives in email/bookmarks there)
 * Dismissal is remembered per portal in localStorage.
 */
export default function AddToHomeScreen({
  storageKey,
  what = "your portal",
}: {
  /** Namespaces the dismissal, e.g. "contractor" | "review" | "onboard" | "upload" */
  storageKey: string;
  /** What the icon opens, in the copy: "your portal", "your project reviews"… */
  what?: string;
}) {
  const [platform, setPlatform] = useState<Platform>(null);
  const [visible, setVisible] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  const dismissKey = `bb-a2hs-dismissed:${storageKey}`;

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already running from the home screen — nothing to teach
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    if (localStorage.getItem(dismissKey) === "1") return;

    const ua = navigator.userAgent;
    // iPadOS masquerades as a Mac; touch points give it away
    const isIos =
      /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);

    if (isIos) {
      setPlatform("ios");
      setVisible(true);
    } else if (isAndroid) {
      setPlatform("android");
      setVisible(true);
    }
    // Desktop: stay hidden

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setTimeout(() => setVisible(false), 2500);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [dismissKey]);

  if (!visible || !platform) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {
      // storage unavailable (private mode) — the card just returns next visit
    }
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
      setTimeout(() => setVisible(false), 2500);
    }
    setInstallEvent(null);
  };

  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shrink-0">
          <Smartphone size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          {installed ? (
            <p className="text-sm text-green-300">
              Added — look for the BlokBlok icon on your home screen.
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-white">Keep this one tap away</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Add it to your home screen and the icon opens {what} directly — no link hunting.
              </p>

              {platform === "ios" ? (
                <ol className="mt-3 space-y-2 text-xs text-gray-300">
                  <li className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center shrink-0">1</span>
                    Tap the <Share size={13} className="inline text-sky-400 shrink-0" aria-label="Share" /> Share button
                    <span className="text-gray-500">(bottom of Safari)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center shrink-0">2</span>
                    Scroll down and tap <SquarePlus size={13} className="inline text-gray-300 shrink-0" aria-label="Add" />
                    <span className="font-medium text-white">Add to Home Screen</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center shrink-0">3</span>
                    Tap <span className="font-medium text-white">Add</span> — done
                  </li>
                </ol>
              ) : installEvent ? (
                <button
                  type="button"
                  onClick={handleInstall}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs font-medium rounded-lg hover:opacity-90 transition-opacity"
                >
                  <Download size={13} />
                  Add to home screen
                </button>
              ) : (
                <ol className="mt-3 space-y-2 text-xs text-gray-300">
                  <li className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center shrink-0">1</span>
                    Tap the <MoreVertical size={13} className="inline text-gray-300 shrink-0" aria-label="Menu" /> menu
                    <span className="text-gray-500">(top right)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center shrink-0">2</span>
                    Tap <span className="font-medium text-white">Add to Home screen</span>
                  </li>
                </ol>
              )}

              {platform === "ios" && (
                <p className="mt-2.5 text-[10px] text-gray-600">
                  No Share button? Open this link in Safari first.
                </p>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 -m-1 text-gray-600 hover:text-gray-300 transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
