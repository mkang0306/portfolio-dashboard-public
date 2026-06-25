"use client";
import { useEffect, useState } from "react";
import type { PortfolioState } from "@/lib/portfolio";
import TaxLossHarvester from "../components/TaxLossHarvester";

interface IncomeData {
  year: number;
  dividends_ytd_total: number;
  dividends_by_ticker: { ticker: string; total: number; count: number; last: string }[];
  dividends_recent: { date: string; ticker: string; amount: number; per_share?: number; shares_at_record?: number }[];
  roth_contributions_ytd: number;
  roth_contribution_limit: number;
  ach_net_ytd: number;
  interest_ytd: number;
}

const fmtUSD = (n: number, frac = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: frac, maximumFractionDigits: frac });

export default function Income({ state }: { state: PortfolioState }) {
  const [data, setData] = useState<IncomeData | null>(null);
  useEffect(() => {
    fetch("/api/income").then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Roth contribution ring */}
        <div className="card p-5">
          <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-faint)]">Roth IRA · {data?.year ?? new Date().getFullYear()}</p>
          {data && (
            <>
              <p className="mt-2 num text-2xl font-semibold text-white">
                {fmtUSD(data.roth_contributions_ytd, 0)}
                <span className="ml-2 text-sm font-normal text-[color:var(--text-faint)]">/ {fmtUSD(data.roth_contribution_limit, 0)}</span>
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-elev-2)]">
                <div
                  className={`h-full ${data.roth_contributions_ytd >= data.roth_contribution_limit ? "bg-[color:var(--good)]" : "bg-[color:var(--accent)]"}`}
                  style={{ width: `${Math.min(100, (data.roth_contributions_ytd / data.roth_contribution_limit) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-[color:var(--text-dim)]">
                {data.roth_contributions_ytd >= data.roth_contribution_limit
                  ? "✓ Maxed for the year. Next contribution window opens Jan 1."
                  : `${fmtUSD(data.roth_contribution_limit - data.roth_contributions_ytd, 0)} remaining`}
              </p>
            </>
          )}
        </div>

        {/* Dividends YTD */}
        <div className="card p-5">
          <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-faint)]">Dividends YTD</p>
          {data && (
            <>
              <p className="mt-2 num text-2xl font-semibold text-white">{fmtUSD(data.dividends_ytd_total)}</p>
              <p className="mt-2 text-xs text-[color:var(--text-dim)]">
                Across {data.dividends_by_ticker.length} positions
              </p>
            </>
          )}
        </div>

        {/* Interest + bonuses */}
        <div className="card p-5">
          <p className="text-[11px] uppercase tracking-wider text-[color:var(--text-faint)]">Interest + Bonuses YTD</p>
          {data && (
            <>
              <p className="mt-2 num text-2xl font-semibold text-white">{fmtUSD(data.interest_ytd)}</p>
              <p className="mt-2 text-xs text-[color:var(--text-dim)]">RH Gold credits, cash sweep interest</p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Dividends by ticker */}
        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Dividends By Position (YTD)</h3>
          </div>
          {data ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border)] text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
                  <th className="px-5 py-2 text-left font-medium">Ticker</th>
                  <th className="px-3 py-2 text-right font-medium">Payments</th>
                  <th className="px-3 py-2 text-right font-medium">Last</th>
                  <th className="px-5 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.dividends_by_ticker.map((d, i) => (
                  <tr key={d.ticker} className={`border-b border-[color:var(--border-muted)] ${i === data.dividends_by_ticker.length - 1 ? "border-b-0" : ""}`}>
                    <td className="px-5 py-2.5 font-mono font-semibold text-white">{d.ticker}</td>
                    <td className="num px-3 py-2.5 text-right text-[color:var(--text-dim)]">{d.count}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-[color:var(--text-dim)]">{d.last}</td>
                    <td className="num px-5 py-2.5 text-right text-white">{fmtUSD(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-5 text-xs text-[color:var(--text-faint)]">Loading…</p>
          )}
        </div>

        {/* Recent Dividend Payments */}
        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Recent Dividend Payments</h3>
          </div>
          {data ? (
            <ul className="divide-y divide-[color:var(--border-muted)]">
              {data.dividends_recent.map((d, i) => (
                <li key={i} className="flex items-baseline justify-between px-5 py-2.5 text-sm">
                  <div>
                    <span className="font-mono font-semibold text-white">{d.ticker}</span>
                    <span className="ml-2 text-xs text-[color:var(--text-faint)]">{d.date}</span>
                  </div>
                  <div className="num text-right">
                    <span className="text-white">{fmtUSD(d.amount)}</span>
                    {d.per_share && (
                      <span className="ml-2 text-[11px] text-[color:var(--text-faint)]">
                        {d.shares_at_record} × ${d.per_share.toFixed(4)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-5 text-xs text-[color:var(--text-faint)]">Loading…</p>
          )}
        </div>
      </div>

      {/* Tax-loss harvesting */}
      <TaxLossHarvester />
    </div>
  );
}
