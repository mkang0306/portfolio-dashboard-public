"use client";
import { useEffect, useState } from "react";
import type { PortfolioState } from "@/lib/portfolio";
import AllocationChart from "../components/AllocationChart";
import ConcentrationMeter from "../components/ConcentrationMeter";
import DriftPanel from "../components/DriftPanel";
import LookThrough from "../components/LookThrough";
import TaxEfficiency from "../components/TaxEfficiency";
import ErrorBoundary from "../components/ErrorBoundary";

interface AttributionRow { ticker: string; weight_pct: number; return_pct: number; contribution_pct: number }
interface AttributionWindow { total_pct: number | null; contributions: AttributionRow[] }

interface Data {
  tickers: string[];
  correlations: (number | null)[][];
  drawdowns: {
    portfolio: { current_pct: number; ath_date: string; ath_value: number; current_date: string; current_value: number };
    per_position: { ticker: string; current_pct: number; ath_date: string; current_price: number; ath_price: number }[];
  };
  attribution: { "1d": AttributionWindow; "5d": AttributionWindow; "1mo": AttributionWindow; ytd: AttributionWindow };
}

const fmtUSD = (n: number, frac = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: frac, maximumFractionDigits: frac });

const WINDOWS: { key: keyof Data["attribution"]; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "5d", label: "1W" },
  { key: "1mo", label: "1M" },
  { key: "ytd", label: "YTD" },
];

function corrColor(v: number | null): string {
  if (v === null) return "var(--bg-elev-2)";
  if (v >= 0.7) return "rgba(63, 185, 80, 0.55)";
  if (v >= 0.4) return "rgba(63, 185, 80, 0.30)";
  if (v >= 0.1) return "rgba(63, 185, 80, 0.12)";
  if (v >= -0.1) return "var(--bg-elev-2)";
  if (v >= -0.4) return "rgba(248, 81, 73, 0.15)";
  if (v >= -0.7) return "rgba(248, 81, 73, 0.30)";
  return "rgba(248, 81, 73, 0.55)";
}

export default function Analysis({ state }: { state: PortfolioState }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attWindow, setAttWindow] = useState<keyof Data["attribution"]>("1mo");

  useEffect(() => {
    setLoading(true);
    fetch("/api/analysis")
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading && !data) return <div className="card p-6 text-sm text-[color:var(--text-faint)]">Running analysis (correlation matrix + drawdown + attribution)...</div>;
  if (error) return <div className="card p-6 text-sm text-[color:var(--bad)]">Error: {error}</div>;
  if (!data) return null;

  // Find pairs of highest correlation (excluding self)
  const pairs: { a: string; b: string; corr: number }[] = [];
  for (let i = 0; i < data.tickers.length; i++) {
    for (let j = i + 1; j < data.tickers.length; j++) {
      const c = data.correlations[i]?.[j];
      if (c !== null && c !== undefined) pairs.push({ a: data.tickers[i], b: data.tickers[j], corr: c });
    }
  }
  const topCorr = pairs.sort((a, b) => b.corr - a.corr).slice(0, 5);
  const bottomCorr = pairs.sort((a, b) => a.corr - b.corr).slice(0, 5);

  const pdd = data.drawdowns.portfolio;
  const att = data.attribution[attWindow];

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-white">Analysis</h2>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--text-dim)]">
          Quantitative views on what you own: allocation, concentration, rebalancing, look-through, correlation, drawdown, and performance attribution.
        </p>
      </div>

      {/* Allocation + Concentration + Rebalancing */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AllocationChart positions={state.positions} />
        <ConcentrationMeter positions={state.positions} />
        <DriftPanel />
      </div>

      {/* Look-through holdings + sector gap */}
      <ErrorBoundary label="Look-Through"><LookThrough /></ErrorBoundary>

      {/* Drawdown summary + per-position */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-white">Portfolio Drawdown</h3>
          <p className="mt-1 text-[11px] text-[color:var(--text-faint)]">Distance from all-time high in the past year</p>
          <div className="mt-4 flex items-baseline gap-3">
            <p className={`num text-3xl font-semibold ${pdd.current_pct >= -2 ? "text-[color:var(--good)]" : pdd.current_pct >= -10 ? "text-[color:var(--warn)]" : "text-[color:var(--bad)]"}`}>
              {pdd.current_pct.toFixed(2)}%
            </p>
            <span className="text-xs text-[color:var(--text-faint)]">
              {pdd.current_pct >= -0.5 ? "at all-time high" : "below ATH"}
            </span>
          </div>
          <div className="mt-3 space-y-1 text-xs text-[color:var(--text-dim)]">
            <p><span className="text-[color:var(--text-faint)]">ATH ({pdd.ath_date}):</span> <span className="num text-white">{fmtUSD(pdd.ath_value)}</span></p>
            <p><span className="text-[color:var(--text-faint)]">Now ({pdd.current_date}):</span> <span className="num text-white">{fmtUSD(pdd.current_value)}</span></p>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Per-Position Drawdown</h3>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">Distance from each ticker's 1-year high</p>
          </div>
          <ul className="max-h-64 divide-y divide-[color:var(--border-muted)] overflow-y-auto">
            {data.drawdowns.per_position.map((p) => {
              const at_ath = p.current_pct >= -0.5;
              return (
                <li key={p.ticker} className="flex items-baseline justify-between px-5 py-2.5 text-xs">
                  <span className="font-mono font-semibold text-white">{p.ticker}</span>
                  <div className="num text-right">
                    <span className={at_ath ? "text-[color:var(--good)]" : p.current_pct >= -10 ? "text-[color:var(--text-dim)]" : p.current_pct >= -20 ? "text-[color:var(--warn)]" : "text-[color:var(--bad)]"}>
                      {at_ath ? "at ATH" : `${p.current_pct.toFixed(1)}%`}
                    </span>
                    <span className="ml-2 text-[10px] text-[color:var(--text-faint)]">ATH ${p.ath_price.toFixed(2)} / {p.ath_date}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Performance Attribution */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Performance Attribution</h3>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">
              Which positions drove the portfolio's change. Contribution = position weight x position return.
            </p>
          </div>
          <div className="flex gap-0.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elev-2)] p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                onClick={() => setAttWindow(w.key)}
                data-active={attWindow === w.key}
                className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[color:var(--text-dim)] transition hover:text-white data-[active=true]:bg-[color:var(--bg-hover)] data-[active=true]:text-white"
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 py-4">
          {att.total_pct !== null && (
            <p className="num mb-3 text-sm">
              <span className="text-[color:var(--text-faint)]">Total {WINDOWS.find((w) => w.key === attWindow)?.label}: </span>
              <span className={`font-medium ${att.total_pct >= 0 ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
                {att.total_pct >= 0 ? "+" : ""}{att.total_pct.toFixed(2)}%
              </span>
            </p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
                <th className="py-1 text-left font-medium">Ticker</th>
                <th className="py-1 text-right font-medium">Weight At Start</th>
                <th className="py-1 text-right font-medium">Position Return</th>
                <th className="py-1 text-right font-medium">Contribution To Portfolio</th>
              </tr>
            </thead>
            <tbody>
              {att.contributions.map((c) => (
                <tr key={c.ticker} className="border-t border-[color:var(--border-muted)]">
                  <td className="py-2 font-mono font-semibold text-white">{c.ticker}</td>
                  <td className="num py-2 text-right text-[color:var(--text-dim)]">{c.weight_pct.toFixed(1)}%</td>
                  <td className={`num py-2 text-right ${c.return_pct >= 0 ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
                    {c.return_pct >= 0 ? "+" : ""}{c.return_pct.toFixed(2)}%
                  </td>
                  <td className={`num py-2 text-right font-medium ${c.contribution_pct >= 0 ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
                    {c.contribution_pct >= 0 ? "+" : ""}{c.contribution_pct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Correlation Matrix */}
      <div className="card overflow-hidden">
        <div className="border-b border-[color:var(--border)] px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Correlation Matrix (1Y Daily Returns)</h3>
          <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">
            Green = move together, red = move opposite, faint = uncorrelated. Hidden concentration shows up as a cluster of green.
          </p>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="text-[10px]">
            <thead>
              <tr>
                <th></th>
                {data.tickers.map((t) => (
                  <th key={t} className="px-1 py-1 font-mono font-medium text-[color:var(--text-dim)]" style={{ minWidth: 32 }}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.tickers.map((rowT, i) => (
                <tr key={rowT}>
                  <th className="px-1 py-1 font-mono font-medium text-[color:var(--text-dim)]">{rowT}</th>
                  {data.correlations[i].map((v, j) => (
                    <td
                      key={j}
                      className="num text-center text-[10px] tabular-nums"
                      style={{ background: corrColor(v), width: 32, height: 26 }}
                      title={`${rowT} / ${data.tickers[j]}: ${v ?? "-"}`}
                    >
                      {v === null ? "-" : v.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-px border-t border-[color:var(--border)] bg-[color:var(--border-muted)] md:grid-cols-2">
          <div className="bg-[color:var(--bg-elev)] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">Most Correlated Pairs</p>
            <ul className="mt-2 space-y-1 text-xs">
              {topCorr.map((p, i) => (
                <li key={i} className="flex justify-between">
                  <span className="font-mono">{p.a} / {p.b}</span>
                  <span className="num text-[color:var(--good)]">{p.corr.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-[color:var(--bg-elev)] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">Least Correlated Pairs (Diversifiers)</p>
            <ul className="mt-2 space-y-1 text-xs">
              {bottomCorr.map((p, i) => (
                <li key={i} className="flex justify-between">
                  <span className="font-mono">{p.a} / {p.b}</span>
                  <span className={`num ${p.corr < 0 ? "text-[color:var(--bad)]" : "text-[color:var(--text-dim)]"}`}>{p.corr.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Tax Efficiency */}
      <ErrorBoundary label="Tax Efficiency">
        <TaxEfficiency />
      </ErrorBoundary>
    </div>
  );
}
