"use client";

import { useCallback, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { createZipLink, isIOSDevice, submitZipForm } from "@/lib/client-download";

type ZipState = { status: "preparing"; count: number } | { status: "ready"; count: number; url: string } | null;

/**
 * Zip downloads for the media galleries. Desktop/Android download straight
 * away. iPhone/iPad get a "zip ready" bar whose button is a real link, because
 * Safari only opens a new window from a direct tap, not after the link is made.
 */
export function useZipDownload() {
  const { toast } = useToast();
  const [state, setState] = useState<ZipState>(null);

  const startZip = useCallback(
    async (ids: string[], name: string) => {
      if (ids.length === 0) return;
      if (!isIOSDevice()) {
        submitZipForm(ids, name);
        toast(`Zipping ${ids.length} files — download starts shortly`, "success");
        return;
      }
      setState({ status: "preparing", count: ids.length });
      try {
        const url = await createZipLink(ids, name);
        setState({ status: "ready", count: ids.length, url });
      } catch (err) {
        setState(null);
        toast((err as Error).message || "Couldn't prepare the zip", "error");
      }
    },
    [toast]
  );

  const zipBar = state ? (
    <div className="fixed inset-x-3 z-[250] bottom-[max(1rem,env(safe-area-inset-bottom))] mx-auto max-w-sm flex items-center gap-3 rounded-xl border border-bb-border bg-bb-surface px-4 py-3 shadow-modal">
      {state.status === "preparing" ? (
        <>
          <Loader2 size={16} className="animate-spin text-bb-orange shrink-0" />
          <span className="text-sm text-white flex-1">Preparing {state.count} files…</span>
        </>
      ) : (
        <>
          <span className="text-sm text-white flex-1">Zip of {state.count} files is ready</span>
          <a
            href={state.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setState(null)}
            className="flex items-center gap-1.5 rounded-lg bg-bb-orange px-3 py-2 text-sm font-medium text-white"
          >
            <Download size={14} /> Download
          </a>
        </>
      )}
      <button onClick={() => setState(null)} aria-label="Dismiss" className="p-1 text-bb-dim hover:text-white shrink-0">
        <X size={16} />
      </button>
    </div>
  ) : null;

  return { startZip, zipBar };
}
