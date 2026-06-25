"use client";
import { useEffect, useState, useCallback } from "react";

interface Candidate {
  ticker: string;
  name?: string;
  thesis_fit_score: number;
  score_delta?: number | null;
  factor_scores?: { value?: number; quality?: number; momentum?: number };
  portfolio_role?: string;
  rationale?: string;
  risks?: string;
  anti_thesis_risks?: string;
  size_suggestion_pct?: number;
  recommended_action?: "watch" | "consider" | "not_now";
  funded_by?: string;
  // Portfolio impact projection (populated client-side for CONSIDER cards)
  impact_projection?: {
    category: string;
    current_pct: number;
    projected_pct: number;
    threshold_pct?: number;
    breaches_threshold: boolean;
  }[];
}
interface Adjacent { anchor: string; candidate: string; thesis_fit_score: number; note?: string }
interface Replacement {
  holding: string;
  alternative: string;
  current_er_pct?: number;
  alt_er_pct?: number;
  annual_saving_estimate_usd?: number | string;
  tracking_error_note?: string;
  // Enriched gross-return fields (populated by ETF comparison API)
  comparison?: EtfComparison;
}
interface Consolidation { proposal: string; rationale?: string; trade_offs?: string }

interface EtfComparison {
  incumbent_er_pct: number;
  candidate_er_pct: number;
  er_savings_bps: number;
  incumbent_net_return_pct: number;
  candidate_net_return_pct: number;
  incumbent_gross_index_pct: number;
  candidate_gross_index_pct: number;
  gross_index_gap_bps: number;
  net_return_gap_bps: number;
  annual_er_savings_usd: number;
  annual_return_loss_usd: number;
  net_annual_impact_usd: number;
  correlation?: number;
}

interface EtfComparisonResult {
  incumbent: string;
  candidate: string;
  position_value: number;
  comparison?: EtfComparison;
  recommendation?: "SWAP" | "DECLINE" | "INVESTIGATE";
  recommendation_reason?: string;
  returns?: Record<string, { annualized_return_pct?: number; annualized_vol_pct?: number; years?: number }>;
  incumbent_info?: { name?: string; aum_b?: number };
  candidate_info?: { name?: string; aum_b?: number };
}

interface ThesisFitData {
  available: boolean;
  date?: string;
  summary?: string;
  candidates?: Candidate[];
  adjacent?: Adjacent[];
  etf_replacements?: Replacement[];
  consolidation?: Consolidation[];
}

const ACTION_STYLE: Record<string, { bg: string; text: string }> = {
  consider: { bg: "bg-[color:var(--good-soft)]", text: "text-[color:var(--good)]" },
  watch: { bg: "bg-[color:var(--accent-soft)]", text: "text-[color:var(--accent)]" },
  not_now: { bg: "bg-[color:var(--bg-elev-2)]", text: "text-[color:var(--text-dim)]" },
};

const REC_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  SWAP: { label: "SWAP", bg: "bg-[color:var(--good-soft)]", text: "text-[color:var(--good)]" },
  DECLINE: { label: "DECLINE", bg: "bg-[color:var(--bad-soft)]", text: "text-[color:var(--bad)]" },
  INVESTIGATE: { label: "INVESTIGATE", bg: "bg-[color:var(--warn-soft)]", text: "text-[color:var(--warn)]" },
};

function ScorePill({ score }: { score: number }) {
  const color = score >= 8 ? "var(--good)" : score >= 6 ? "var(--accent)" : score >= 4 ? "var(--warn)" : "var(--bad)";
  return (
    <span className="num font-mono text-xs font-semibold" style={{ color }}>
      {score}/10
    </span>
  );
}

function EtfComparisonCard({ r }: { r: Replacement & { compData?: EtfComparisonResult } }) {
  const comp = r.compData;
  const c = comp?.comparison;
  const rec = comp?.recommendation;
  const recStyle = rec ? REC_STYLE[rec] : null;

  return (
    <li className="px-5 py-4">
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-white">{r.holding}</span>
          <span className="text-[color:var(--text-faint)]">{"→"}</span>
          <span className="font-mono font-semibold text-[color:var(--text)]">{r.alternative}</span>
          {recStyle && (
            <span className={`rounded px-2 py-0.5 text-[10px] font-mono font-medium ${recStyle.bg} ${recStyle.text}`}>
              {recStyle.label}
            </span>
          )}
        </div>
      </div>

      {/* Comparison table */}
      {c ? (
        <div className="mt-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
                <th className="pb-1 text-left">Metric</th>
                <th className="pb-1 text-right">{r.holding}</th>
                <th className="pb-1 text-right">{r.alternative}</th>
                <th className="pb-1 text-right">Gap</th>
              </tr>
            </thead>
            <tbody className="text-[color:var(--text-dim)]">
              <tr>
                <td className="py-0.5">Expense Ratio</td>
                <td className="num py-0.5 text-right">{c.incumbent_er_pct}%</td>
                <td className="num py-0.5 text-right text-[color:var(--good)]">{c.candidate_er_pct}%</td>
                <td className="num py-0.5 text-right">{c.er_savings_bps} bps</td>
              </tr>
              <tr>
                <td className="py-0.5">Net Return (ann.)</td>
                <td className="num py-0.5 text-right">{c.incumbent_net_return_pct}%</td>
                <td className="num py-0.5 text-right">{c.candidate_net_return_pct}%</td>
                <td className={`num py-0.5 text-right ${c.net_return_gap_bps > 0 ? "text-[color:var(--bad)]" : "text-[color:var(--good)]"}`}>
                  {c.net_return_gap_bps > 0 ? "+" : ""}{c.net_return_gap_bps} bps
                </td>
              </tr>
              <tr>
                <td className="py-0.5">Gross Index (ann.)</td>
                <td className="num py-0.5 text-right">{c.incumbent_gross_index_pct}%</td>
                <td className="num py-0.5 text-right">{c.candidate_gross_index_pct}%</td>
                <td className={`num py-0.5 text-right ${c.gross_index_gap_bps > 0 ? "text-[color:var(--warn)]" : "text-[color:var(--good)]"}`}>
                  {c.gross_index_gap_bps > 0 ? "+" : ""}{c.gross_index_gap_bps} bps
                </td>
              </tr>
              {c.correlation !== undefined && (
                <tr>
                  <td className="py-0.5">Correlation</td>
                  <td colSpan={3} className="num py-0.5 text-right">{c.correlation}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Net annual impact */}
          <div className="mt-3 flex items-baseline justify-between rounded border border-[color:var(--border-muted)] bg-[color:var(--bg-elev-2)] px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">Net Annual Impact</span>
            <div className="text-right">
              <span className={`num text-sm font-semibold ${c.net_annual_impact_usd > 0 ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
                {c.net_annual_impact_usd > 0 ? "+" : ""}${c.net_annual_impact_usd.toFixed(2)}/yr
              </span>
              <p className="text-[10px] text-[color:var(--text-faint)]">
                ER savings ${c.annual_er_savings_usd.toFixed(2)} {c.annual_return_loss_usd > 0 ? `- return loss $${c.annual_return_loss_usd.toFixed(2)}` : `+ return gain $${Math.abs(c.annual_return_loss_usd).toFixed(2)}`}
              </p>
            </div>
          </div>

          {/* AUM comparison */}
          {comp?.incumbent_info?.aum_b != null && comp?.candidate_info?.aum_b != null && (
            <p className="mt-2 text-[10px] text-[color:var(--text-faint)]">
              AUM: {r.holding} ${comp.incumbent_info.aum_b}B vs {r.alternative} ${comp.candidate_info.aum_b}B
              {comp.candidate_info.aum_b < 0.5 && (
                <span className="ml-1 text-[color:var(--warn)]">(low liquidity risk)</span>
              )}
            </p>
          )}

          {/* Data window */}
          {comp?.returns?.[r.holding]?.years && (
            <p className="mt-1 text-[10px] text-[color:var(--text-faint)]">
              Based on {comp.returns[r.holding].years}y of overlapping data
            </p>
          )}
        </div>
      ) : (
        // Fallback: old-style ER-only display
        <div className="mt-2">
          <span className="num text-xs text-[color:var(--text-dim)]">
            ER {r.current_er_pct}% {"→"} {r.alt_er_pct}%
            {r.annual_saving_estimate_usd != null && typeof r.annual_saving_estimate_usd === "number" && (
              <span className="ml-2 text-[color:var(--good)]">~${r.annual_saving_estimate_usd.toFixed(0)}/yr ER savings</span>
            )}
          </span>
          <p className="mt-1 text-[10px] text-[color:var(--warn)]">
            ER-only comparison. Run /api/etf-comparison to get gross return analysis.
          </p>
        </div>
      )}

      {/* Recommendation reason */}
      {comp?.recommendation_reason && (
        <p className="mt-2 text-xs leading-relaxed text-[color:var(--text-dim)]">{comp.recommendation_reason}</p>
      )}

      {/* Legacy tracking error note */}
      {!comp && r.tracking_error_note && (
        <p className="mt-1.5 text-sm text-[color:var(--text-dim)]">{r.tracking_error_note}</p>
      )}
    </li>
  );
}

export default function ThesisFit() {
  const [data, setData] = useState<ThesisFitData | null>(null);
  const [etfComps, setEtfComps] = useState<Record<string, EtfComparisonResult>>({});
  const [watchlistTickers, setWatchlistTickers] = useState<Set<string>>(new Set());
  const [addingTicker, setAddingTicker] = useState<string | null>(null);

  const reloadWatchlist = useCallback(() => {
    fetch("/api/notes")
      .then((r) => r.json())
      .then((d) => {
        const tickers = new Set<string>((d.watchlist ?? []).map((w: { ticker: string }) => w.ticker));
        setWatchlistTickers(tickers);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/discover/thesis-fit").then((r) => r.json()).then(setData).catch(() => setData({ available: false }));
    reloadWatchlist();
  }, [reloadWatchlist]);

  // Fetch ETF comparison data for each replacement pair
  useEffect(() => {
    if (!data?.etf_replacements) return;
    for (const r of data.etf_replacements) {
      const key = `${r.holding}-${r.alternative}`;
      if (etfComps[key]) continue;
      fetch(`/api/etf-comparison?incumbent=${r.holding}&candidate=${r.alternative}`)
        .then((res) => res.json())
        .then((comp) => {
          if (!comp.error) {
            setEtfComps((prev) => ({ ...prev, [key]: comp }));
          }
        })
        .catch(() => {});
    }
  }, [data?.etf_replacements]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also load held tickers so we don't show "add to watchlist" for things already held
  const [heldTickers, setHeldTickers] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch("/api/holdings")
      .then((r) => r.json())
      .then((d) => {
        const tickers = new Set<string>((d.holdings ?? []).map((h: { ticker: string }) => h.ticker));
        setHeldTickers(tickers);
      })
      .catch(() => {});
  }, []);

  async function addToWatchlist(ticker: string, note: string, role?: string) {
    setAddingTicker(ticker);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          status: "watch",
          note,
          tags: role ? [role.toLowerCase().replace(/\s+/g, "_")] : [],
        }),
      });
      if (res.ok) {
        setWatchlistTickers((prev) => new Set(prev).add(ticker));
      }
    } finally {
      setAddingTicker(null);
    }
  }

  function WatchlistBtn({ ticker, note, role }: { ticker: string; note: string; role?: string }) {
    if (heldTickers.has(ticker)) return null; // already held
    if (watchlistTickers.has(ticker)) {
      return (
        <span className="text-[10px] text-[color:var(--good)]">On watchlist</span>
      );
    }
    return (
      <button
        onClick={() => addToWatchlist(ticker, note, role)}
        disabled={addingTicker === ticker}
        className="rounded border border-[color:var(--border)] px-2 py-0.5 text-[10px] text-[color:var(--text-dim)] transition hover:border-[color:var(--accent)] hover:text-white disabled:opacity-50"
      >
        {addingTicker === ticker ? "Adding..." : "+ Watchlist"}
      </button>
    );
  }

  if (!data) return null;
  if (!data.available) {
    return (
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="chip">Bucket A</span>
          <h3 className="text-sm font-semibold text-white">Thesis-Fit Candidates</h3>
        </div>
        <p className="mt-2 text-xs text-[color:var(--text-faint)]">
          No scan yet. Weekly GitHub Action runs Sundays 8pm PT. Run manually with{" "}
          <code className="text-[color:var(--text-dim)]">.venv/bin/python scripts/thesis_fit.py</code> or
          via{" "}
          <code className="text-[color:var(--text-dim)]">gh workflow run weekly-thesis-fit.yml</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="chip">Bucket A</span>
              <h3 className="text-sm font-semibold text-white">Thesis-Fit Candidates</h3>
            </div>
            <p className="mt-1 text-[11px] text-[color:var(--text-faint)]">Latest scan: {data.date}</p>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-[color:var(--text)]">{data.summary}</p>
        </div>
      </div>

      {/* Top Candidates */}
      {data.candidates && data.candidates.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Top Candidates</h3>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">Ranked by thesis-fit score</p>
          </div>
          <ul className="divide-y divide-[color:var(--border-muted)]">
            {data.candidates.map((c) => {
              const action = c.recommended_action ?? "watch";
              const style = ACTION_STYLE[action];
              return (
                <li key={c.ticker} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-base font-semibold text-white">{c.ticker}</span>
                      <span className="text-xs text-[color:var(--text-faint)]">{c.name}</span>
                      <ScorePill score={c.thesis_fit_score} />
                      {typeof c.score_delta === "number" && c.score_delta !== 0 && (
                        <span className={`num text-[10px] font-medium ${c.score_delta > 0 ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
                          {c.score_delta > 0 ? "↑" : "↓"}{Math.abs(c.score_delta)} wk/wk
                        </span>
                      )}
                      {c.portfolio_role && (
                        <span className="chip">{c.portfolio_role}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {c.size_suggestion_pct !== undefined && (
                        <span className="num text-xs text-[color:var(--text-dim)]">
                          {c.size_suggestion_pct}% target
                        </span>
                      )}
                      <span className={`rounded px-2 py-0.5 text-[10px] font-mono font-medium ${style.bg} ${style.text}`}>
                        {action.replace("_", " ").toUpperCase()}
                      </span>
                      <WatchlistBtn
                        ticker={c.ticker}
                        note={`Thesis-fit score ${c.thesis_fit_score}/10. ${c.rationale?.slice(0, 120) ?? ""}`}
                        role={c.portfolio_role}
                      />
                    </div>
                  </div>
                  {c.factor_scores && (
                    <div className="mt-2 flex gap-3 text-[10px] text-[color:var(--text-dim)]">
                      <span>Value <span className="num font-mono text-[color:var(--text)]">{c.factor_scores.value ?? "-"}/10</span></span>
                      <span>Quality <span className="num font-mono text-[color:var(--text)]">{c.factor_scores.quality ?? "-"}/10</span></span>
                      <span>Momentum <span className="num font-mono text-[color:var(--text)]">{c.factor_scores.momentum ?? "-"}/10</span></span>
                    </div>
                  )}

                  {/* Portfolio Impact Projection for CONSIDER candidates */}
                  {action === "consider" && c.size_suggestion_pct && (
                    <PortfolioImpact ticker={c.ticker} sizePct={c.size_suggestion_pct} role={c.portfolio_role} />
                  )}

                  {c.rationale && (
                    <p className="mt-3 text-sm leading-relaxed text-[color:var(--text-dim)]">
                      <span className="font-medium text-[color:var(--text)]">Why: </span>{c.rationale}
                    </p>
                  )}
                  {(c.anti_thesis_risks ?? c.risks) && (
                    <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-dim)]">
                      <span className="font-medium text-[color:var(--text)]">Anti-thesis: </span>{c.anti_thesis_risks ?? c.risks}
                    </p>
                  )}
                  {c.funded_by && (
                    <p className="mt-2 text-[11px] text-[color:var(--text-faint)]">
                      Fund via: {c.funded_by}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Adjacent */}
      {data.adjacent && data.adjacent.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Adjacent To Conviction</h3>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">Names in the same fight as your high-conviction positions</p>
          </div>
          <ul className="divide-y divide-[color:var(--border-muted)]">
            {data.adjacent.map((a, i) => (
              <li key={i} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-white">{a.candidate}</span>
                    <span className="text-xs text-[color:var(--text-faint)]">adjacent to</span>
                    <span className="font-mono text-[color:var(--accent)]">{a.anchor}</span>
                    <ScorePill score={a.thesis_fit_score} />
                  </div>
                  <WatchlistBtn
                    ticker={a.candidate}
                    note={`Adjacent to ${a.anchor}. ${a.note?.slice(0, 120) ?? ""}`}
                    role="mag7_adjacent"
                  />
                </div>
                {a.note && <p className="mt-1.5 text-sm text-[color:var(--text-dim)]">{a.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ETF replacements — enriched with gross return comparison */}
      {data.etf_replacements && data.etf_replacements.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">ETF Replacement Analysis</h3>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">
              Gross index return comparison, not just expense ratios
            </p>
          </div>
          <ul className="divide-y divide-[color:var(--border-muted)]">
            {data.etf_replacements.map((r, i) => {
              const key = `${r.holding}-${r.alternative}`;
              return <EtfComparisonCard key={i} r={{ ...r, compData: etfComps[key] }} />;
            })}
          </ul>
        </div>
      )}

      {/* Consolidation */}
      {data.consolidation && data.consolidation.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Consolidation Candidates</h3>
          </div>
          <ul className="divide-y divide-[color:var(--border-muted)]">
            {data.consolidation.map((c, i) => (
              <li key={i} className="px-5 py-3">
                <p className="font-medium text-white">{c.proposal}</p>
                {c.rationale && <p className="mt-1.5 text-sm text-[color:var(--text-dim)]"><span className="font-medium text-[color:var(--text)]">Rationale: </span>{c.rationale}</p>}
                {c.trade_offs && <p className="mt-1 text-sm text-[color:var(--text-dim)]"><span className="font-medium text-[color:var(--text)]">Trade-offs: </span>{c.trade_offs}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Portfolio Impact Projection: shows how adding a candidate affects category exposure. */
function PortfolioImpact({ ticker, sizePct, role }: { ticker: string; sizePct: number; role?: string }) {
  const [impact, setImpact] = useState<{ category: string; current: number; projected: number; warning: boolean }[] | null>(null);

  useEffect(() => {
    // Fetch current portfolio to compute impact
    fetch("/api/prices")
      .then((r) => r.json())
      .then((data) => {
        if (!data.positions) return;
        const totalValue = data.total_value ?? 0;
        if (totalValue === 0) return;

        // Map the candidate's role to a thesis-layer category
        const candidateCategory = mapRoleToCategory(role, ticker);

        // Compute current category weights
        const categoryWeights: Record<string, number> = {};
        for (const p of data.positions) {
          const cat = getPositionCategory(p.ticker);
          categoryWeights[cat] = (categoryWeights[cat] ?? 0) + (p.weight_pct ?? 0);
        }

        // Compute projected weights if candidate is added at sizePct
        // Adding at sizePct means existing positions compress proportionally
        const scale = (100 - sizePct) / 100;
        const projections: typeof impact = [];

        for (const [cat, weight] of Object.entries(categoryWeights)) {
          const projected = weight * scale + (cat === candidateCategory ? sizePct : 0);
          if (Math.abs(projected - weight) > 0.1 || cat === candidateCategory) {
            projections.push({
              category: cat,
              current: Math.round(weight * 10) / 10,
              projected: Math.round(projected * 10) / 10,
              warning: projected > 45, // soft ceiling for any category
            });
          }
        }

        // Add the candidate's category if not already represented
        if (!categoryWeights[candidateCategory]) {
          projections.push({
            category: candidateCategory,
            current: 0,
            projected: sizePct,
            warning: sizePct > 45,
          });
        }

        // Sort by impact magnitude
        projections.sort((a, b) => Math.abs(b.projected - b.current) - Math.abs(a.projected - a.current));
        setImpact(projections.slice(0, 4));
      })
      .catch(() => {});
  }, [ticker, sizePct, role]);

  if (!impact || impact.length === 0) return null;

  return (
    <div className="mt-3 rounded border border-[color:var(--border-muted)] bg-[color:var(--bg-elev-2)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
        Portfolio Impact (if added at {sizePct}%)
      </p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {impact.map((i) => (
          <span key={i.category} className={`text-xs ${i.warning ? "text-[color:var(--warn)]" : "text-[color:var(--text-dim)]"}`}>
            {i.category}: <span className="num">{i.current}%</span>
            <span className="mx-1 text-[color:var(--text-faint)]">{"→"}</span>
            <span className={`num font-medium ${i.warning ? "text-[color:var(--warn)]" : "text-[color:var(--text)]"}`}>
              {i.projected}%
            </span>
            {i.warning && <span className="ml-1 text-[9px]">(above 45% ceiling)</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// Category mapping for portfolio impact projection
function mapRoleToCategory(role?: string, ticker?: string): string {
  if (!role) return "Other";
  const r = role.toLowerCase();
  if (r.includes("ai") || r.includes("compute")) return "AI Compute";
  if (r.includes("base") || r.includes("index") || r.includes("core")) return "Base Index";
  if (r.includes("factor") || r.includes("satellite")) return "Factor / Conviction";
  if (r.includes("hedge")) return "Hedge";
  if (r.includes("thematic")) return "Thematic";
  if (r.includes("international") || r.includes("intl")) return "International";
  return "Other";
}

function getPositionCategory(ticker: string): string {
  const MAG7 = new Set(["AAPL", "AMZN", "META", "NVDA", "GOOGL", "MSFT"]);
  if (MAG7.has(ticker) || ticker === "DRAM") return "AI Compute";
  if (["VTI", "VXUS", "EWY", "AVUS"].includes(ticker)) return "Base Index";
  if (["AVUV", "QTUM"].includes(ticker)) return "Factor / Conviction";
  if (ticker === "GLD") return "Hedge";
  return "Other";
}
