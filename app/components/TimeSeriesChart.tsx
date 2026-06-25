"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  ComposedChart, ReferenceArea, ReferenceDot,
} from "recharts";

const PERIODS = [
  { key: "1d", label: "1D" },
  { key: "5d", label: "1W" },
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
  { key: "max", label: "All" },
];

const BENCHMARKS = [
  { key: "SPY", label: "SPY", color: "#a371f7", desc: "S&P 500" },
  { key: "QQQ", label: "QQQ", color: "#d29922", desc: "Nasdaq-100" },
  { key: "VTI", label: "VTI", color: "#39c5cf", desc: "Total US Market" },
  { key: "ACWI", label: "ACWI", color: "#f85149", desc: "Global Equity" },
  { key: "IWM", label: "IWM", color: "#3fb950", desc: "Russell 2000" },
];

interface SeriesPoint { t: string; portfolio: number; [k: string]: number | string }

interface Transaction { date: string; ticker: string; action: "buy" | "sell"; shares: number; price: number; amount: number; drip: boolean }

const fmtMoney = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TimeSeriesChart() {
  const [period, setPeriod] = useState("1mo");
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [showTxns, setShowTxns] = useState(true);
  const [data, setData] = useState<SeriesPoint[]>([]);
  const [allTxns, setAllTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  // Drag-to-compare state
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const enabledList = useMemo(() => Array.from(enabled), [enabled]);

  // Fetch transactions once
  useEffect(() => {
    fetch("/api/transactions")
      .then((r) => r.json())
      .then((d) => setAllTxns((d.transactions ?? []).filter((t: Transaction) => !t.drip)))
      .catch(() => setAllTxns([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = `period=${period}${enabledList.length ? `&benchmarks=${enabledList.join(",")}` : ""}`;
    fetch(`/api/history?${qs}`)
      .then((r) => r.json())
      .then((d) => setData(d.series ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
    // Clear any prior selection on period change
    setDragStart(null); setDragEnd(null); setIsDragging(false);
  }, [period, enabledList]);

  // Snap each transaction's date to the nearest chart timestamp, get the portfolio value at that point.
  const txnMarkers = useMemo(() => {
    if (!showTxns || data.length === 0 || allTxns.length === 0) return [];
    const tsMs = data.map((d) => new Date(d.t).getTime());
    const startMs = tsMs[0];
    const endMs = tsMs[tsMs.length - 1];
    return allTxns
      .map((tx) => {
        const txMs = new Date(tx.date).getTime();
        if (txMs < startMs || txMs > endMs) return null;
        let bestIdx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < tsMs.length; i++) {
          const diff = Math.abs(tsMs[i] - txMs);
          if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
        }
        return {
          ...tx,
          chart_t: data[bestIdx].t,
          chart_y: data[bestIdx].portfolio,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [allTxns, data, showTxns]);

  // Whole-period stats
  const start = data[0]?.portfolio ?? 0;
  const end = data[data.length - 1]?.portfolio ?? 0;
  const delta = end - start;
  const deltaPct = start ? (delta / start) * 100 : 0;
  const positive = delta >= 0;
  const lineColor = positive ? "#3fb950" : "#f85149";
  const fillId = positive ? "fillGood" : "fillBad";
  const ath = useMemo(() => Math.max(...data.map((d) => d.portfolio || 0)), [data]);

  // Drag-selection stats
  const selection = useMemo(() => {
    if (!dragStart || !dragEnd || dragStart === dragEnd) return null;
    const idxA = data.findIndex((d) => d.t === dragStart);
    const idxB = data.findIndex((d) => d.t === dragEnd);
    if (idxA < 0 || idxB < 0) return null;
    const [lo, hi] = idxA <= idxB ? [idxA, idxB] : [idxB, idxA];
    const a = data[lo].portfolio;
    const b = data[hi].portfolio;
    const dlt = b - a;
    const pct = a ? (dlt / a) * 100 : 0;
    const days = Math.max(1, Math.round((new Date(data[hi].t).getTime() - new Date(data[lo].t).getTime()) / 86400000));
    return { startT: data[lo].t, endT: data[hi].t, startV: a, endV: b, delta: dlt, pct, days };
  }, [dragStart, dragEnd, data]);

  const formatTick = (iso: string) => {
    const d = new Date(iso);
    if (period === "1d") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (period === "5d" || period === "1mo" || period === "3mo" || period === "1y") {
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }
    return d.toLocaleDateString([], { month: "short", year: "2-digit" });
  };

  const handleMouseDown = (e: { activeLabel?: string } | null) => {
    if (!e?.activeLabel) return;
    setDragStart(e.activeLabel);
    setDragEnd(e.activeLabel);
    setIsDragging(true);
  };
  const handleMouseMove = (e: { activeLabel?: string } | null) => {
    if (!isDragging || !e?.activeLabel) return;
    setDragEnd(e.activeLabel);
  };
  const handleMouseUp = () => setIsDragging(false);
  const clearSelection = () => { setDragStart(null); setDragEnd(null); };

  const headerDelta = selection ?? { delta, pct: deltaPct };
  const headerPositive = headerDelta.delta >= 0;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--border)] px-5 py-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h3 className="text-sm font-semibold text-white">Portfolio Performance</h3>
            {data.length > 0 && (
              <span className={`num text-sm font-medium ${headerPositive ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
                {headerPositive ? "+" : "−"}${Math.abs(headerDelta.delta).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="ml-1.5 text-[color:var(--text-dim)]">({headerDelta.pct >= 0 ? "+" : ""}{headerDelta.pct.toFixed(2)}%)</span>
              </span>
            )}
            {selection && (
              <button onClick={clearSelection} className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)] hover:text-white">
                · selected {selection.days}d · clear
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[color:var(--text-faint)]">
            Drag on the chart to compare any two dates · backtested with current shares
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elev-2)] p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                data-active={period === p.key}
                className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[color:var(--text-dim)] transition hover:text-white data-[active=true]:bg-[color:var(--bg-hover)] data-[active=true]:text-white"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-5 pb-2 pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setShowTxns((s) => !s)}
            data-active={showTxns}
            className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg-elev-2)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-dim)] transition hover:text-white data-[active=true]:border-[color:var(--accent)] data-[active=true]:bg-[color:var(--accent-soft)] data-[active=true]:text-[color:var(--accent)]"
            title="Show buy/sell markers"
          >
            Trades
          </button>
          <span className="mx-1 text-[color:var(--border)]">|</span>
          <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">Compare:</span>
          {BENCHMARKS.map((b) => {
            const on = enabled.has(b.key);
            return (
              <button
                key={b.key}
                onClick={() => setEnabled((prev) => {
                  const next = new Set(prev);
                  if (next.has(b.key)) next.delete(b.key);
                  else next.add(b.key);
                  return next;
                })}
                title={b.desc}
                className="flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium transition"
                style={{
                  borderColor: on ? b.color : "var(--border)",
                  background: on ? `${b.color}1a` : "var(--bg-elev-2)",
                  color: on ? b.color : "var(--text-dim)",
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: b.color }} />
                {b.label}
              </button>
            );
          })}
        </div>
        <div className="h-64 select-none">
          {loading && data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-[color:var(--text-faint)]">Loading…</div>
          ) : data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-[color:var(--text-faint)]">No data for this period</div>
          ) : (
            <ResponsiveContainer>
              <ComposedChart
                data={data}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <defs>
                  <linearGradient id="fillGood" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3fb950" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3fb950" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fillBad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f85149" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#f85149" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="t"
                  tickFormatter={formatTick}
                  stroke="#6e7681"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={48}
                />
                <YAxis
                  orientation="right"
                  stroke="#6e7681"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                />
                {!selection && (
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = new Date(label as string);
                      return (
                        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elev)] px-3 py-2 text-xs shadow-xl">
                          <p className="mb-1 text-[10px] text-[color:var(--text-faint)]">
                            {d.toLocaleString([], { dateStyle: "medium", timeStyle: period === "1d" ? "short" : undefined })}
                          </p>
                          {payload.map((entry) => {
                            const v = entry.value as number;
                            const key = entry.dataKey as string;
                            const lbl = key === "portfolio" ? "Portfolio" : key;
                            return (
                              <div key={key} className="flex items-center justify-between gap-3">
                                <span style={{ color: entry.color }}>{lbl}</span>
                                <span className="num font-mono font-medium text-white">{fmtMoney(v)}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                )}
                {ath > 0 && (
                  <ReferenceLine y={ath} stroke="#484f58" strokeDasharray="2 4" strokeOpacity={0.6}
                    label={{ value: `ATH ${fmtMoney(ath)}`, position: "insideTopRight", fill: "#6e7681", fontSize: 9 }} />
                )}
                {dragStart && dragEnd && dragStart !== dragEnd && (
                  <ReferenceArea
                    x1={dragStart}
                    x2={dragEnd}
                    strokeOpacity={0}
                    fill="#58a6ff"
                    fillOpacity={0.12}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="portfolio"
                  stroke={lineColor}
                  strokeWidth={2}
                  fill={`url(#${fillId})`}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 3, fill: lineColor, stroke: "#0d1117", strokeWidth: 2 }}
                />
                {enabledList.map((b) => {
                  const meta = BENCHMARKS.find((x) => x.key === b);
                  if (!meta) return null;
                  return (
                    <Line
                      key={b}
                      type="monotone"
                      dataKey={b}
                      stroke={meta.color}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  );
                })}
                {selection && (
                  <>
                    <ReferenceDot x={selection.startT} y={selection.startV} r={4} fill="#58a6ff" stroke="#0d1117" strokeWidth={2} />
                    <ReferenceDot x={selection.endT} y={selection.endV} r={4} fill="#58a6ff" stroke="#0d1117" strokeWidth={2} />
                  </>
                )}
                {txnMarkers.map((tx, i) => {
                  const isBuy = tx.action === "buy";
                  const color = isBuy ? "#3fb950" : "#f85149";
                  return (
                    <ReferenceDot
                      key={`tx-${i}`}
                      x={tx.chart_t}
                      y={tx.chart_y}
                      r={5}
                      fill={color}
                      stroke="#0d1117"
                      strokeWidth={1.5}
                      shape={(props: { cx?: number; cy?: number }) => {
                        const { cx = 0, cy = 0 } = props;
                        const size = 6;
                        const path = isBuy
                          ? `M${cx},${cy - size} L${cx + size},${cy + size} L${cx - size},${cy + size} Z`
                          : `M${cx},${cy + size} L${cx + size},${cy - size} L${cx - size},${cy - size} Z`;
                        return <path d={path} fill={color} stroke="#0d1117" strokeWidth={1.5} />;
                      }}
                    >
                      <title>{`${tx.action.toUpperCase()} ${tx.shares} ${tx.ticker} @ $${tx.price.toFixed(2)} (${tx.date})`}</title>
                    </ReferenceDot>
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        {selection && (
          <div className="mt-1 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-elev-2)] px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-[color:var(--text-faint)]">
                {new Date(selection.startT).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                {" → "}
                {new Date(selection.endT).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                {" · "}{selection.days} day{selection.days === 1 ? "" : "s"}
              </span>
              <span className="num">
                <span className="text-[color:var(--text-faint)]">From </span>
                <span className="font-mono text-white">{fmtMoney(selection.startV)}</span>
                <span className="text-[color:var(--text-faint)]"> to </span>
                <span className="font-mono text-white">{fmtMoney(selection.endV)}</span>
              </span>
              <span className={`num font-medium ${selection.delta >= 0 ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
                {selection.delta >= 0 ? "+" : "−"}{fmtMoney(Math.abs(selection.delta))}
                {" "}({selection.pct >= 0 ? "+" : ""}{selection.pct.toFixed(2)}%)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
