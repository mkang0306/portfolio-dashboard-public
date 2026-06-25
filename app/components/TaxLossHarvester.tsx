"use client";
import { useEffect, useState } from "react";

interface PartnerSuggestion { ticker: string; rationale: string; tracking_error: "minimal" | "low" | "moderate" }
interface HoldingPeriodInfo { earliest_known_buy: string | null; days_held: number | null; classification: "short_term" | "long_term" | "mixed" | "unknown"; notes: string }
interface WashSaleStatus { blocked: boolean; recent_buys: { date: string; shares: number; price: number; drip: boolean }[]; blocked_until: string | null; drip_active: boolean; notes: string[] }
interface HarvestOpportunity {
  ticker: string; name: string;
  unrealized_pl: number; unrealized_pl_pct: number;
  holding_period: HoldingPeriodInfo;
  wash_sale: WashSaleStatus;
  replacements: PartnerSuggestion[];
  est_tax_savings_short_term: number;
  est_tax_savings_long_term: number;
  priority_rank: number;
}
interface Ledger { year: number; realized_pl_ytd_estimate: number | null; caveat: string }
interface Data { opportunities: HarvestOpportunity[]; ledger: Ledger }

// Mirrors DEFAULT_TAX_ASSUMPTIONS in lib/tax_loss.ts — keep in sync if either changes.
const ST_RATE_PCT = 32;
const LT_RATE_PCT = 15;

const fmtUSD = (n: number) => `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const PERIOD_LABEL: Record<HoldingPeriodInfo["classification"], { label: string; color: string }> = {
  short_term: { label: "Short-term", color: "text-[color:var(--good)]" },
  long_term: { label: "Long-term", color: "text-[color:var(--text-dim)]" },
  mixed: { label: "Mixed lots", color: "text-[color:var(--warn)]" },
  unknown: { label: "Period unknown", color: "text-[color:var(--text-faint)]" },
};

const TRACKING_LABEL = {
  minimal: { label: "minimal tracking error", color: "text-[color:var(--good)]" },
  low: { label: "low tracking error", color: "text-[color:var(--good)]" },
  moderate: { label: "moderate tracking error", color: "text-[color:var(--warn)]" },
};

export default function TaxLossHarvester() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tax-loss")
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading && !data) return <div className="card p-5 text-xs text-[color:var(--text-faint)]">Computing harvest opportunities…</div>;
  if (error) return <div className="card p-5 text-sm text-[color:var(--bad)]">Tax-loss API error: {error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Realized YTD ledger */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-white">Tax-Loss Harvesting Candidates</h3>
          <div className="num text-right text-xs">
            <span className="text-[color:var(--text-faint)]">Realized YTD {data.ledger.year}: </span>
            {data.ledger.realized_pl_ytd_estimate !== null ? (
              <span className={data.ledger.realized_pl_ytd_estimate >= 0 ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}>
                {data.ledger.realized_pl_ytd_estimate >= 0 ? "+" : "−"}{fmtUSD(data.ledger.realized_pl_ytd_estimate)}
              </span>
            ) : (
              <span className="text-[color:var(--text-faint)]">est. unavailable</span>
            )}
          </div>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-faint)]">
          Selling a loser realizes the loss to offset gains. Wash-sale rule blocks the deduction if you bought or DRIPed
          the same security in the 30 days before OR after the sale. Holding period determines tax treatment: short-term
          losses offset short-term gains (taxed at ordinary income rates → higher value).
          <br />
          <span className="italic">{data.ledger.caveat}</span>
        </p>
      </div>

      {data.opportunities.length === 0 && (
        <div className="card p-5 text-sm text-[color:var(--good)]">
          No positions sitting at meaningful losses (&gt; $50). Nothing to harvest right now.
        </div>
      )}

      {data.opportunities.map((o) => {
        const periodMeta = PERIOD_LABEL[o.holding_period.classification];
        // ST = ordinary-rate savings (higher value). For mixed/LT/unknown, fall back to LT rate label.
        const isST = o.holding_period.classification === "short_term";
        const taxSavings = isST ? o.est_tax_savings_short_term : o.est_tax_savings_long_term;
        const rateLabel = isST ? `${ST_RATE_PCT}% (ord. income)` : `${LT_RATE_PCT}% (LTCG)`;
        return (
          <div key={o.ticker} className={`card overflow-hidden ${o.wash_sale.blocked ? "border-[color:var(--warn)]/40" : ""}`}>
            <div className="border-b border-[color:var(--border)] px-5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="num font-mono text-[10px] text-[color:var(--text-faint)]">#{o.priority_rank}</span>
                  <span className="font-mono text-sm font-semibold text-white">{o.ticker}</span>
                  <span className="text-xs text-[color:var(--text-faint)]">{o.name}</span>
                  <span className={`chip ${periodMeta.color}`}>{periodMeta.label}</span>
                  {o.wash_sale.blocked && <span className="chip text-[color:var(--warn)]" style={{ background: "var(--warn-soft)" }}>WASH-BLOCKED</span>}
                  {o.wash_sale.drip_active && !o.wash_sale.blocked && <span className="chip text-[color:var(--warn)]" style={{ background: "var(--warn-soft)" }}>DRIP RISK</span>}
                </div>
                <div className="num text-right">
                  <p className="text-sm font-medium text-[color:var(--bad)]">
                    {fmtUSD(o.unrealized_pl)} loss
                    <span className="ml-1 text-xs">({o.unrealized_pl_pct.toFixed(1)}%)</span>
                  </p>
                  <p className="text-[11px] text-[color:var(--text-faint)]">
                    Est. tax savings {fmtUSD(taxSavings)} <span className="text-[color:var(--text-faint)]">@ {rateLabel}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Wash-sale section */}
            {o.wash_sale.notes.length > 0 && (
              <div className={`border-b border-[color:var(--border)] px-5 py-3 text-xs ${o.wash_sale.blocked ? "bg-[color:var(--warn-soft)]" : "bg-[color:var(--bg-elev-2)]"}`}>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">Wash-sale check</p>
                {o.wash_sale.notes.map((n, i) => (
                  <p key={i} className={i === 0 ? "text-[color:var(--text)]" : "mt-1 text-[color:var(--text-dim)]"}>{n}</p>
                ))}
                {o.wash_sale.recent_buys.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-[color:var(--text-faint)]">
                    {o.wash_sale.recent_buys.map((b, i) => (
                      <li key={i} className="num">
                        · {b.date}: bought {b.shares} sh @ ${b.price.toFixed(2)}{b.drip ? " (DRIP)" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Holding period */}
            <div className="border-b border-[color:var(--border)] px-5 py-3 text-xs">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">Holding period</p>
              <p className="text-[color:var(--text-dim)]">{o.holding_period.notes}</p>
            </div>

            {/* Replacements */}
            <div className="px-5 py-3">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
                Wash-sale-safe replacements during 31-day window
              </p>
              {o.replacements.length === 0 ? (
                <p className="text-xs text-[color:var(--text-faint)]">No curated replacements yet for {o.ticker}. Weekly thesis-fit will propose some.</p>
              ) : (
                <ul className="space-y-2">
                  {o.replacements.map((r) => {
                    const te = TRACKING_LABEL[r.tracking_error];
                    return (
                      <li key={r.ticker} className="flex items-baseline gap-2 text-xs">
                        <span className="font-mono font-semibold text-[color:var(--accent)]">{r.ticker}</span>
                        <span className="flex-1 text-[color:var(--text-dim)]">{r.rationale}</span>
                        <span className={`text-[10px] ${te.color}`}>· {te.label}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 text-[10px] text-[color:var(--text-faint)]">
                Not tax advice. Coordinate across all household accounts (incl. Roth + spouse). Wash-sale rules apply across them. Verify with your CPA.
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
