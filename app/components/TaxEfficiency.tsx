"use client";
import { useEffect, useState } from "react";

interface TaxHolding {
  ticker: string;
  tax_efficiency_score: number | null;
  account: string;
  account_optimal: boolean;
  notes: string;
  distribution_yield_pct: number;
  collectible_treatment?: boolean;
  distribution_breakdown?: {
    qualified_pct: number;
    non_qualified_pct: number;
    st_cap_gains_pct: number;
    lt_cap_gains_pct: number;
    return_of_capital_pct: number;
  };
  pretax_return_1y: number | null;
  aftertax_return_1y: number | null;
  pretax_return_5y: number | null;
  aftertax_return_5y: number | null;
  tax_drag_annual_pct: number | null;
}

interface TaxAlert {
  ticker: string;
  type: "low_score" | "misplaced" | "high_distribution";
  message: string;
}

interface TaxData {
  available: boolean;
  holdings: Record<string, TaxHolding>;
  alerts: TaxAlert[];
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-[color:var(--text-faint)]";
  if (score >= 8) return "text-[color:var(--good)]";
  if (score >= 6) return "text-[color:var(--text)]";
  if (score >= 4) return "text-[color:var(--warn)]";
  return "text-[color:var(--bad)]";
}

function scoreBg(score: number | null): string {
  if (score === null) return "bg-[color:var(--bg-elev-2)]";
  if (score >= 8) return "bg-[color:var(--good-soft)]";
  if (score >= 6) return "bg-[color:var(--bg-elev-2)]";
  if (score >= 4) return "bg-[color:var(--warn-soft)]";
  return "bg-[color:var(--bad-soft)]";
}

export default function TaxEfficiency() {
  const [data, setData] = useState<TaxData | null>(null);

  useEffect(() => {
    fetch("/api/tax-efficiency")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data || !data.available) return null;

  const holdings = Object.values(data.holdings).sort((a, b) => {
    // Sort: lowest score first (worst tax efficiency), nulls last
    const sa = a.tax_efficiency_score ?? 99;
    const sb = b.tax_efficiency_score ?? 99;
    return sa - sb;
  });

  const etfHoldings = holdings.filter((h) => h.tax_efficiency_score !== null);
  const avgScore = etfHoldings.length > 0
    ? etfHoldings.reduce((s, h) => s + (h.tax_efficiency_score ?? 0), 0) / etfHoldings.length
    : null;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[color:var(--border)] px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Tax Efficiency</h3>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">
              Tax drag costs 1.6-1.8%/yr on equities, dwarfing ER. Data from prospectuses + tax-efficiency.yaml.
            </p>
          </div>
          {avgScore !== null && (
            <div className="text-right">
              <span className={`num text-lg font-semibold ${scoreColor(Math.round(avgScore))}`}>
                {avgScore.toFixed(1)}
              </span>
              <span className="text-[10px] text-[color:var(--text-faint)]">/10 avg</span>
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="border-b border-[color:var(--border)] bg-[color:var(--bad-soft)] px-5 py-3">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[color:var(--bad)]">Tax Alerts</p>
          {data.alerts.map((a, i) => (
            <p key={i} className="text-xs text-[color:var(--bad)]">
              <span className="font-mono font-semibold">{a.ticker}</span>: {a.message}
            </p>
          ))}
        </div>
      )}

      {/* Holdings table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[color:var(--border)] text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
              <th className="px-5 py-3 text-left">Ticker</th>
              <th className="px-3 py-3 text-right">Score</th>
              <th className="px-3 py-3 text-right">Dist. Yield</th>
              <th className="px-3 py-3 text-left">Account</th>
              <th className="px-3 py-3 text-left">Placement</th>
              <th className="px-3 py-3 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.ticker} className="border-b border-[color:var(--border-muted)]">
                <td className="px-5 py-3">
                  <span className="font-mono text-sm font-semibold text-white">{h.ticker}</span>
                </td>
                <td className="px-3 py-3 text-right">
                  {h.tax_efficiency_score !== null ? (
                    <span className={`num rounded px-2 py-0.5 text-[10px] font-mono font-semibold ${scoreColor(h.tax_efficiency_score)} ${scoreBg(h.tax_efficiency_score)}`}>
                      {h.tax_efficiency_score}/10
                    </span>
                  ) : (
                    <span className="text-[color:var(--text-faint)]">N/A</span>
                  )}
                </td>
                <td className="num px-3 py-3 text-right text-[color:var(--text-dim)]">
                  {h.distribution_yield_pct > 0 ? `${h.distribution_yield_pct}%` : "-"}
                </td>
                <td className="px-3 py-3">
                  <span className="chip">{h.account}</span>
                </td>
                <td className="px-3 py-3">
                  {h.account_optimal ? (
                    <span className="text-[10px] text-[color:var(--good)]">Optimal</span>
                  ) : (
                    <span className="text-[10px] font-medium text-[color:var(--warn)]">Review</span>
                  )}
                </td>
                <td className="max-w-[250px] truncate px-3 py-3 text-[color:var(--text-faint)]" title={h.notes}>
                  {h.collectible_treatment && (
                    <span className="mr-1 text-[color:var(--warn)]">[28% collectible]</span>
                  )}
                  {h.notes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
