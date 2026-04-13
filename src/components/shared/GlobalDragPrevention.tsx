"use client";

import { useEffect } from "react";

/**
 * Prevents the browser from opening files in a new tab when dragged onto the page.
 *
 * How it works:
 * - dragover: preventDefault in CAPTURE phase (required for drop to work at all)
 * - drop: preventDefault in BUBBLE phase on WINDOW (last resort fallback)
 *   This only catches drops that weren't handled by a component's onDrop.
 *   React synthetic event handlers fire before window bubble handlers.
 */
export default function GlobalDragPrevention() {
  useEffect(() => {
    // dragover MUST be prevented for drop events to fire at all.
    // Using capture phase so it runs early, but only calling preventDefault
    // (not stopPropagation) so the event still reaches React components.
    const preventDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    // Drop fallback on window — catches any drops not handled by components.
    // React's onDrop handlers fire earlier (on the root element in bubble phase),
    // so component handlers process first. This is just the safety net.
    const preventDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    document.addEventListener("dragover", preventDragOver, true);
    window.addEventListener("drop", preventDrop);

    return () => {
      document.removeEventListener("dragover", preventDragOver, true);
      window.removeEventListener("drop", preventDrop);
    };
  }, []);

  return null;
}
