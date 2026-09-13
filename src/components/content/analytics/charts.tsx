"use client";

import { format, parseISO } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

/**
 * Single-series charts for the analytics tab. One series means no legend: the
 * card title names the metric. Series color is the dark-surface orange step
 * validated with the dataviz palette checker against bb-surface (#141414);
 * bb-orange itself is too light for the band.
 */
export const SERIES_COLOR = "#d95926";
const GRID = "#2A2A2A";
const AXIS_TEXT = "#8A8A8A";

export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return new Intl.NumberFormat("en-US", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
}

function ChartTooltip({
  active,
  payload,
  label,
  metricLabel,
  dateFormat,
}: TooltipContentProps<number, string> & { metricLabel: string; dateFormat: string }) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number;
  return (
    <div className="rounded-lg bg-bb-elevated border border-bb-border px-3 py-2 shadow-modal">
      <p className="text-sm font-semibold text-white tabular-nums">{(value ?? 0).toLocaleString()}</p>
      <p className="flex items-center gap-1.5 text-[11px] text-bb-muted">
        <span className="inline-block w-3 h-0.5 rounded" style={{ background: SERIES_COLOR }} aria-hidden />
        {metricLabel} · {label ? format(typeof label === "string" ? parseISO(label) : new Date(label), dateFormat) : ""}
      </p>
    </div>
  );
}

/** Area-under-line time series with a crosshair tooltip. */
export function TrendChart({
  data,
  dataKey,
  metricLabel,
  xKey = "date",
  height = 220,
  dateFormat = "MMM d",
  tooltipDateFormat = "EEE MMM d",
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  metricLabel: string;
  xKey?: string;
  height?: number;
  dateFormat?: string;
  tooltipDateFormat?: string;
}) {
  const gradientId = `trend-${dataKey}`;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.14} />
              <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(v: string) => format(parseISO(v), dateFormat)}
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={28}
          />
          <YAxis
            tickFormatter={(v: number) => compact(v)}
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "#555", strokeWidth: 1 }}
            content={(props) => (
              <ChartTooltip
                {...(props as unknown as TooltipContentProps<number, string>)}
                metricLabel={metricLabel}
                dateFormat={tooltipDateFormat}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={SERIES_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={`url(#${gradientId})`}
            activeDot={{ r: 4, fill: SERIES_COLOR, stroke: "#141414", strokeWidth: 2 }}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars, one color, value at the tip. Identity comes from the row label. */
export function BarList({
  rows,
  valueLabel,
}: {
  rows: { key: string; label: React.ReactNode; value: number; detail?: string }[];
  valueLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5" aria-label={valueLabel}>
      {rows.map((r) => (
        <li key={r.key} className="group">
          <div className="flex items-center justify-between gap-3 text-xs mb-1">
            <span className="min-w-0 flex items-center gap-1.5 text-bb-muted">{r.label}</span>
            <span className="text-white tabular-nums">
              {r.value.toLocaleString()}
              {r.detail && <span className="text-bb-dim"> · {r.detail}</span>}
            </span>
          </div>
          <div className="h-2" title={`${r.value.toLocaleString()} ${valueLabel}`}>
            <div
              className="h-full rounded-r transition-[width] duration-300 group-hover:brightness-110"
              style={{ width: `${Math.max(r.value > 0 ? 1.5 : 0, (r.value / max) * 100)}%`, background: SERIES_COLOR }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
