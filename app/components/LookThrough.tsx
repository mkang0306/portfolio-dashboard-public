"use client";
import { useEffect, useState } from "react";

interface Underlying {
  ticker: string;
  name: string;
  total: number;
  contributions: { from: string; weight: number }[];
}

interface Data {
  underlyings: Underlying[];
  sectors: Record<string, number>;
  benchmark: string;
  benchmark_sectors: Record<string, number>;
}

const SECTOR_LABELS: Record<string, string> = {
  technology: "Technology",
  financial_services: "Financial Services",
  consumer_cyclical: "Consumer Cyclical",
  consumer_defensive: "Consumer Defensive",
  communication_services: "Communication Services",
  industrials: "Industrials",
  healthcare: "Healthcare",
  energy: "Energy",
  basic_materials: "Basic Materials",
  utilities: "Utilities",
  realestate: "Real Estate",
  other: "Other / Commodity",
};

export default function LookThrough() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/discover/lookthrough")
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading && !data) return <div className="card p-5 text-xs text-[color:var(--text-faint)]">Computing look-through… (takes ~30s on first load, then cached for 24h)</div>;
  if (error) return <div className="card p-5 text-sm text-[color:var(--bad)]">Error: {error}</div>;
  if (!data) return null;

  const realCompanies = data.underlyings.filter((u) => !u.ticker.endsWith("-TAIL"));
  const top10 = realCompanies.slice(0, 10);
  const totalCovered = realCompanies.reduce((s, u) => s + u.total, 0);
  const maxBar = top10[0]?.total ?? 1;

  const sectorRows = Object.entries(data.sectors)
    .map(([sec, w]) => ({ sec, w, bench: data.benchmark_sectors[sec] ?? 0, delta: w - (data.benchmark_sectors[sec] ?? 0) }))
    .sort((a, b) => b.w - a.w);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="chip">Bucket C</span>
          <h3 className="text-sm font-semibold text-white">Look-Through Holdings + Sector Breakdown</h3>
        </div>
        <p className="text-xs text-[color:var(--text-dim)]">
          "Through-the-ETF" view of what you actually own. NVDA at 6.4% direct may be ~8% effective once VTI / AVUS look-through is counted. Sector gap shows where you diverge from {data.benchmark} (the S&P 500 baseline). Refreshed daily.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top underlying companies */}
        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Top 10 Underlying Companies</h3>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">
              Direct + ETF look-through · top {realCompanies.length} cover {totalCovered.toFixed(1)}% of portfolio
            </p>
          </div>
          <ul className="divide-y divide-[color:var(--border-muted)]">
            {top10.map((u) => {
              const sources = u.contributions.map((c) => `${c.from} ${c.weight}%`).join(" + ");
              const isDirect = u.contributions.length === 1 && u.contributions[0].from === u.ticker;
              return (
                <li key={u.ticker} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-sm font-semibold text-white">{u.ticker}</span>
                        <span className="truncate text-[11px] text-[color:var(--text-faint)]">{u.name}</span>
                        {!isDirect && <span className="chip">via {u.contributions.length} holdings</span>}
                      </div>
                      <p className="mt-1 truncate text-[10px] text-[color:var(--text-faint)]">{sources}</p>
                    </div>
                    <span className="num font-mono text-sm font-semibold text-white">{u.total.toFixed(2)}%</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-[color:var(--bg-elev-2)]">
                    <div
                      className="h-full bg-[color:var(--accent)]"
                      style={{ width: `${(u.total / maxBar) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Sector breakdown */}
        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Sector Exposure vs {data.benchmark}</h3>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">
              ↑ overweight if &gt; +3%, ↓ underweight if &lt; −3% . Gaps are intentional bets or unintended drift.
            </p>
          </div>
          <ul className="divide-y divide-[color:var(--border-muted)]">
            {sectorRows.map(({ sec, w, bench, delta }) => {
              const label = SECTOR_LABELS[sec] ?? sec;
              const overweight = delta > 3;
              const underweight = delta < -3;
              const max = Math.max(w, bench, 5);
              return (
                <li key={sec} className="px-5 py-2.5">
                  <div className="mb-1.5 flex items-baseline justify-between text-xs">
                    <span className="text-[color:var(--text)]">{label}</span>
                    <span className="num text-[color:var(--text-dim)]">
                      <span className="text-white">{w.toFixed(1)}%</span>
                      <span className="ml-1 text-[color:var(--text-faint)]">vs {bench.toFixed(1)}%</span>
                      <span className={`ml-2 ${overweight ? "text-[color:var(--warn)]" : underweight ? "text-[color:var(--accent)]" : "text-[color:var(--text-faint)]"}`}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(1)}{overweight ? " ↑" : underweight ? " ↓" : ""}
                      </span>
                    </span>
                  </div>
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-elev-2)]">
                    {/* benchmark line */}
                    <div
                      className="absolute top-0 h-full w-px bg-[color:var(--text-faint)]"
                      style={{ left: `${(bench / max) * 100}%` }}
                    />
                    {/* user bar */}
                    <div
                      className={`absolute top-0 h-full rounded-full ${overweight ? "bg-[color:var(--warn)]" : underweight ? "bg-[color:var(--accent)]" : "bg-[color:var(--good)]"}`}
                      style={{ width: `${(w / max) * 100}%`, opacity: 0.7 }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
