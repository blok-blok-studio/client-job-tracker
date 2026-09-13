"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function FieldLabel({ children, hint, htmlFor }: { children: React.ReactNode; hint?: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 mb-1">
      <span className="text-xs font-medium text-bb-muted">{children}</span>
      {hint && <span className="text-[11px] text-bb-dim">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange/60 focus:ring-2 focus:ring-bb-orange/20 transition-colors disabled:opacity-50";

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  disabledReason,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 py-1.5", disabled && "opacity-60")}>
      <div className="min-w-0">
        <p className="text-sm text-white">{label}</p>
        {(disabled && disabledReason) ? (
          <p className="text-[11px] text-bb-dim mt-0.5">{disabledReason}</p>
        ) : description ? (
          <p className="text-[11px] text-bb-dim mt-0.5">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative w-9 h-5 rounded-full shrink-0 mt-0.5 transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-orange/50",
          checked ? "bg-bb-orange" : "bg-bb-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
            checked ? "left-[18px]" : "left-0.5"
          )}
        />
      </button>
    </div>
  );
}

export function CharCounter({ value, max }: { value: number; max?: number }) {
  if (!max) return null;
  const over = value > max;
  const near = !over && value > max * 0.9;
  return (
    <span className={cn("text-[11px] font-mono tabular-nums", over ? "text-red-400" : near ? "text-amber-400" : "text-bb-dim")}>
      {value}/{max}
    </span>
  );
}

export function Card({ title, icon, children, action, className }: { title?: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-bb-border bg-bb-surface", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-bb-border">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-bb-muted">
            {icon}
            {title}
          </h3>
          {action}
        </header>
      )}
      <div className="p-3.5 space-y-3">{children}</div>
    </section>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T | null;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-bb-elevated border border-bb-border">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 min-w-[72px] px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
            value === o.value ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white hover:bg-bb-surface"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Chip list input for handles / tags. */
export function ChipInput({
  values,
  onChange,
  placeholder,
  prefix = "",
  max,
  disabled,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  prefix?: string;
  max?: number;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const atMax = max !== undefined && values.length >= max;

  const commit = () => {
    const parts = input
      .split(/[\s,]+/)
      .map((t) => t.trim().replace(/^[@#]+/, ""))
      .filter(Boolean);
    const next = [...values];
    for (const p of parts) {
      if (!next.includes(p) && (max === undefined || next.length < max)) next.push(p);
    }
    onChange(next);
    setInput("");
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 bg-bb-elevated border border-bb-border rounded-lg px-2 py-1.5 focus-within:border-bb-orange/60 transition-colors",
        disabled && "opacity-50"
      )}
    >
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-bb-surface border border-bb-border pl-2 pr-1 py-0.5 text-xs text-white">
          {prefix}
          {v}
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="p-0.5 rounded-full text-bb-dim hover:text-white cursor-pointer"
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {!atMax && !disabled && (
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || (e.key === " " && input.trim())) {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !input && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => input.trim() && commit()}
          placeholder={values.length ? "" : placeholder}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder:text-bb-dim outline-none py-0.5"
        />
      )}
    </div>
  );
}

export function Avatar({ src, name, size = 28, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={cn("rounded-full object-cover bg-bb-elevated shrink-0", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn("rounded-full bg-bb-elevated border border-bb-border flex items-center justify-center text-bb-muted font-medium shrink-0", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
    >
      {(name.replace(/^@/, "")[0] || "?").toUpperCase()}
    </span>
  );
}
