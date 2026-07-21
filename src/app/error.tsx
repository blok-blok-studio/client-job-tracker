"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bb-black flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
          <span className="text-red-400 text-xl">!</span>
        </div>
        <h1 className="text-lg font-display font-semibold text-white">Something broke on this page</h1>
        <p className="text-bb-muted text-sm break-words">
          {error.message || "Unknown error"}
          {error.digest && <span className="block text-bb-dim text-xs mt-1">Ref: {error.digest}</span>}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 bg-bb-orange hover:bg-bb-orange-light text-white text-sm font-medium rounded-lg transition-colors"
        >
          <RotateCcw size={14} /> Reload page
        </button>
      </div>
    </div>
  );
}
