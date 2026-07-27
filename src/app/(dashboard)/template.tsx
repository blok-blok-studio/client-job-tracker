"use client";

import { useState } from "react";

// Remounts on every route change inside the dashboard, giving each page a
// subtle 300ms fade-up entrance. Disabled automatically for users with
// prefers-reduced-motion (see globals.css).
// The animation class is removed once it finishes: its fill-mode keeps a
// transform on this wrapper, which turns it into the containing block for
// position:fixed descendants (dnd-kit's DragOverlay, modals) and offsets them.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const [settled, setSettled] = useState(false);
  return (
    <div
      className={settled ? undefined : "animate-fade-in-up"}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setSettled(true);
      }}
    >
      {children}
    </div>
  );
}
