"use client";

import { useEffect } from "react";

/**
 * Prevents the browser's default behavior of opening files in a new tab
 * when drag-and-dropped anywhere on the page. This runs at the document
 * level so component drop zones (MediaManager) can still handle their
 * own events.
 *
 * Works across all browsers including Vivaldi, Chrome, Firefox, Safari.
 */
export default function GlobalDragPrevention() {
  useEffect(() => {
    // preventDefault on dragover is REQUIRED to make drop work at all.
    // Without it, the browser ignores drop events entirely.
    // We do NOT stopPropagation so component handlers still fire.
    const preventDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    // Prevent the browser from navigating to the dropped file.
    // Components that handle drops call stopPropagation() in the
    // bubble phase, so their handler runs first. If a component
    // handled it, defaultPrevented will already be true. If not
    // (dropped outside a drop zone), we prevent it here.
    const preventDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    // Use bubble phase (not capture) so component handlers run first
    document.addEventListener("dragover", preventDragOver);
    document.addEventListener("drop", preventDrop);

    return () => {
      document.removeEventListener("dragover", preventDragOver);
      document.removeEventListener("drop", preventDrop);
    };
  }, []);

  return null;
}
