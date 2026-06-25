"use client";
import { useEffect, useState } from "react";

interface Entry { label: string; level?: number; change_1d_pct?: number; change_1mo_pct?: number; error?: string }

const ORDER = ["DXY", "VIX", "TNX", "OIL", "GOLD", "BTC"];

const RELEVANCE: Record<string, string> = {
  DXY: "Stronger USD → headwind for VXUS / EWY / GLD; weaker USD → tailwind",
  VIX: "Fear gauge: spikes correlate with risk-off; thesis says hold through, not sell",
  TNX: "Higher 10Y → discount-rate pressure on long-duration growth (NVDA / Mag 7)",
  OIL: "Inflation pulse → secondary impact on rates → growth multiples",
  GOLD: "Direct GLD reference; tracks dollar/inflation hedge thesis",
  BTC: "Risk-on barometer + alternative inflation hedge",
};

const fmt = (k: string, v: number) => {
  if (k === "TNX") return `${v.toFixed(3)}%`; // ^TNX is already in %
  if (k === "BTC") return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (k === "OIL" || k === "GOLD") return `$${v.toFixed(2)}`;
  return v.toFixed(2);
};

const fmtPct = (v: number | undefined) => {
  if (v === undefined || v === null) return "-";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
};

export default function MacroSignals() {
  const [data, setData] = useState<Record<string, Entry> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/discover/macro").then((r) => r.json()).then((d) => { if (!d.error) setData(d); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card p-5 text-xs text-[color:var(--text-faint)]">Loading macro signals…</div>;
  if (!data) return null;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[color:var(--border)] px-5 py-4">
        <h3 className="text-sm font-semibold text-white">Macro Signals</h3>
        <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">Context for the regime your portfolio is operating in</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[color:var(--border-muted)] md:grid-cols-3">
        {ORDER.map((k) => {
          const e = data[k];
          if (!e || e.error) return (
            <div key={k} className="bg-[color:var(--bg-elev)] p-4">
              <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-faint)]">{k}</p>
              <p className="mt-1 text-xs text-[color:var(--text-faint)]">unavailable</p>
            </div>
          );
          const dayPos = (e.change_1d_pct ?? 0) >= 0;
          const moPos = (e.change_1mo_pct ?? 0) >= 0;
          return (
            <div key={k} className="bg-[color:var(--bg-elev)] p-4">
              <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-faint)]">{e.label}</p>
              <p className="mt-1.5 num text-lg font-semibold text-white">{e.level !== undefined ? fmt(k, e.level) : "-"}</p>
              <div className="mt-1 flex gap-3 text-[11px]">
                <span className={dayPos ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}>
                  1d {fmtPct(e.change_1d_pct)}
                </span>
                <span className={moPos ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}>
                  1mo {fmtPct(e.change_1mo_pct)}
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-snug text-[color:var(--text-faint)]">{RELEVANCE[k]}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
