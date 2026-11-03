"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { Analytics } from "@/lib/invoicing/analytics";
import { chipCls, readJsonSafe, money } from "./shared";

/**
 * Stripe-style analytics rebuilt from our own records. Colors are the dark-surface
 * blue and orange steps validated with the dataviz palette checker against
 * bb-surface (#141414): adjacent CVD ΔE 26.8, contrast >= 3:1.
 */
const SUB = "#3987e5";
const ONE_OFF = "#d95926";
const SURFACE = "#141414";
const GRID = "#2A2A2A";
const AXIS_TEXT = "#8A8A8A";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const eur = (n: number) => money(n, "EUR");
const eurShort = (n: number) => (Math.abs(n) >= 1000 ? `€${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `€${Math.round(n)}`);
const monthLabel = (m: string, withYear: boolean) => `${MONTHS[Number(m.slice(5, 7)) - 1]}${withYear ? ` ${m.slice(2, 4)}` : ""}`;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-xl p-4">
      <p className="text-xs text-bb-muted">{label}</p>
      <p className="text-xl font-semibold text-white tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[11px] text-bb-dim mt-0.5">{sub}</p>}
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-xl p-4">
      <p className="text-sm text-white font-medium">{title}</p>
      {note && <p className="text-[11px] text-bb-dim mb-2">{note}</p>}
      {children}
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} aria-hidden />;
}

function MonthTip({ active, payload, label, withYear }: TooltipContentProps<number, string> & { withYear: boolean }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Analytics["months"][number];
  return (
    <div className="rounded-lg bg-bb-elevated border border-bb-border px-3 py-2 text-xs space-y-0.5">
      <p className="text-white font-semibold">{label ? monthLabel(String(label), withYear) : ""}: {eur(p.total)}</p>
      <p className="text-bb-muted flex items-center gap-1.5"><Swatch color={SUB} /> Subscriptions {eur(p.subscriptions)}</p>
      <p className="text-bb-muted flex items-center gap-1.5"><Swatch color={ONE_OFF} /> One-off {eur(p.oneOff)}</p>
      <p className="text-bb-dim">{p.payments} payment(s)</p>
    </div>
  );
}

function SimpleTip({ active, payload, label, name }: TooltipContentProps<number, string> & { name: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-bb-elevated border border-bb-border px-3 py-2 text-xs">
      <p className="text-white font-semibold tabular-nums">{eur(Number(payload[0].value))}</p>
      <p className="text-bb-muted">{name} · {String(label)}</p>
    </div>
  );
}

export default function AnalyticsPanel() {
  const [year, setYear] = useState<number | null>(new Date().getUTCFullYear());
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(`/api/studio-invoices/analytics${year ? `?year=${year}` : ""}`)
      .then(readJsonSafe)
      .then((j) => { if (!alive) return; if (j.success) setData(j.data as Analytics); else setError(j.error || "Could not load"); })
      .catch(() => alive && setError("Could not load"));
    return () => { alive = false; };
  }, [year]);

  const withYear = year === null;
  // The running total stops at the current month instead of running flat into the future
  const nowMonth = new Date().toISOString().slice(0, 7);
  const running = (data?.months || []).map((m) => (m.month > nowMonth ? { ...m, cumulative: null } : m));
  const t = data?.totals;
  const ceilingPct = data && year ? Math.round(((data.months.at(-1)?.cumulative ?? 0) / data.ceilingEur) * 1000) / 10 : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(data?.years.length ? [...data.years].reverse() : [{ year: new Date().getUTCFullYear() }]).map((y) => (
          <button key={y.year} className={chipCls(year === y.year)} onClick={() => setYear(y.year)}>{y.year}</button>
        ))}
        <button className={chipCls(year === null)} onClick={() => setYear(null)}>All time</button>
        <p className="text-[11px] text-bb-dim ml-auto">EUR on the day the money arrived, before Stripe fees. Stripe payments plus our own paid invoices.</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!data || !t ? (
        !error && <p className="text-sm text-bb-dim">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Net volume" value={eur(t.netEur)} sub={`after ${eur(t.lostEur)} refunded or disputed`} />
            <Tile label="Gross volume" value={eur(t.grossEur)} sub={`${t.payments} payments, average ${eur(t.avgEur)}`} />
            <Tile label="MRR today" value={eur(data.mrr.eur)} sub={`${data.mrr.plans} live subscription(s)`} />
            <Tile label="Paying customers" value={String(t.customers)} sub={year ? `${t.newCustomers} new in ${year}` : "all time"} />
            <Tile label="From subscriptions" value={`${t.subscriptionShare}%`} sub="of net volume" />
            <Tile label="Refunds" value={String(t.refunds)} />
            <Tile label="Disputes lost" value={String(t.disputes)} />
            <Tile label={year ? "§ 19 ceiling used" : "Currencies"} value={ceilingPct != null ? `${ceilingPct}%` : Object.keys(t.byCurrency).join(" + ")} sub={ceilingPct != null ? `of ${eur(data.ceilingEur)}` : Object.entries(t.byCurrency).map(([c, v]) => money(v, c)).join(" + ")} />
          </div>

          <Card title="Income by month" note="Each bar is the money that arrived that month, split into subscriptions and one-off payments.">
            <div className="flex gap-4 text-[11px] text-bb-muted mb-1">
              <span className="flex items-center gap-1.5"><Swatch color={SUB} /> Subscriptions</span>
              <span className="flex items-center gap-1.5"><Swatch color={ONE_OFF} /> One-off</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m, withYear)} tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={8} />
                  <YAxis tickFormatter={eurShort} tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={(p) => <MonthTip {...(p as TooltipContentProps<number, string>)} withYear={withYear} />} />
                  <Bar dataKey="subscriptions" stackId="m" fill={SUB} stroke={SURFACE} strokeWidth={2} />
                  <Bar dataKey="oneOff" stackId="m" fill={ONE_OFF} stroke={SURFACE} strokeWidth={2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            {year ? (
              <Card title="Running total toward the €100,000 ceiling" note="§ 19 ends the moment a year's income passes the line.">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={running} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke={GRID} />
                      <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m, false)} tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
                      <YAxis domain={[0, Math.max(data.ceilingEur, data.months.at(-1)?.cumulative ?? 0)]} tickFormatter={eurShort} tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
                      <ReferenceLine y={data.ceilingEur} stroke={AXIS_TEXT} strokeDasharray="4 4" label={{ value: "€100k ceiling", fill: AXIS_TEXT, fontSize: 11, position: "insideTopLeft" }} />
                      <Tooltip cursor={{ stroke: GRID }} content={(p) => <SimpleTip {...(p as TooltipContentProps<number, string>)} name="Running total" />} labelFormatter={(m) => monthLabel(String(m), false)} />
                      <Area type="monotone" dataKey="cumulative" stroke={SUB} strokeWidth={2} fill={SUB} fillOpacity={0.12} dot={false} activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            ) : null}
            <div className={year ? "" : "md:col-span-2"}>
            <Card title="Income by year" note="Net of refunds and lost disputes.">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.years} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="35%">
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="year" tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
                    <YAxis tickFormatter={eurShort} tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
                    <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={(p) => <SimpleTip {...(p as TooltipContentProps<number, string>)} name="Income" />} />
                    <Bar dataKey="eur" fill={SUB} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            </div>
            <div className="md:col-span-2">
            <Card title="Top clients" note={year ? `By income in ${year}.` : "By income, all time."}>
              <div style={{ height: Math.max(120, data.topClients.length * 30) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topClients} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap="25%">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="client" width={170} tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)} tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={(p) => <SimpleTip {...(p as TooltipContentProps<number, string>)} name="Income" />} />
                    <Bar dataKey="eur" fill={SUB} radius={[0, 4, 4, 0]} label={{ position: "right", fill: AXIS_TEXT, fontSize: 11, formatter: (v: unknown) => eurShort(Number(v)) }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            </div>
          </div>

          <details className="bg-bb-surface border border-bb-border rounded-xl p-4">
            <summary className="text-sm text-white cursor-pointer">Table view</summary>
            <table className="w-full text-xs mt-3 tabular-nums">
              <thead className="text-bb-muted"><tr><th className="text-left py-1">Month</th><th className="text-right">Subscriptions</th><th className="text-right">One-off</th><th className="text-right">Total</th><th className="text-right">Running total</th><th className="text-right">Payments</th></tr></thead>
              <tbody className="text-white">
                {data.months.map((m) => (
                  <tr key={m.month} className="border-t border-bb-border/50">
                    <td className="py-1">{monthLabel(m.month, true)}</td><td className="text-right">{eur(m.subscriptions)}</td><td className="text-right">{eur(m.oneOff)}</td><td className="text-right">{eur(m.total)}</td><td className="text-right">{eur(m.cumulative)}</td><td className="text-right">{m.payments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}
