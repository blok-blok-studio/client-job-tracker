"use client";

import { useRef } from "react";
import type { FocusPoint } from "@/lib/social/formats";

interface Props {
  value: FocusPoint;
  onChange: (point: FocusPoint) => void;
  className?: string;
}

const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;

/**
 * Click or drag anywhere on the frame to choose what stays in view when the
 * media is cropped. Arrow keys nudge it (Shift for bigger steps).
 */
export default function FocusPointPicker({ value, onChange, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pointFromEvent = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    onChange({ x: clamp((e.clientX - rect.left) / rect.width), y: clamp((e.clientY - rect.top) / rect.height) });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    onChange({ x: clamp(value.x + move[0]), y: clamp(value.y + move[1]) });
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Crop focus point"
      aria-valuenow={Math.round(value.x * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${Math.round(value.x * 100)}% from left, ${Math.round(value.y * 100)}% from top`}
      title="Drag to choose what stays in the frame"
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        pointFromEvent(e);
      }}
      onPointerMove={(e) => dragging.current && pointFromEvent(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      className={`absolute inset-0 cursor-crosshair touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-bb-orange ${className}`}
    >
      <span
        className="pointer-events-none absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)] bg-bb-orange/40"
        style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }}
      />
    </div>
  );
}
