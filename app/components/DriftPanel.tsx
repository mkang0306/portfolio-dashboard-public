"use client";
import { useEffect, useState } from "react";

type Severity = "info" | "watch" | "act_when_funding" | "act_now";

interface RebalanceAction {
  ticker: string;
  name: string;
  account: string;
  current_weight_pct: number;
  target_weight_pct: number;
  drift_pct: number;
  drift_usd: number;
  cap_violation: { kind: string; limit_pct: number } | null;
  recommendation: "direct_new_contributions" | "trim_in_tax_advantaged" | "consider_trim_taxable" | "harvest_loss" | "hold";
  severity: Severity;
  rationale: string;
  tax_note: string;
  est_trim_shares: number | null;
  wash_sale_blocked: boolean;
}

interface Plan {
  any_action_required: boolean;
  next_contribution_guidance: { total_underweight_usd: number; by_ticker: { ticker: string; needed_usd: number; weight_to_close: number }[] };
  actions: RebalanceAction[];
  summary: string;
}

const SEVERITY_STYLE: Record<Severity, { dot: string; label: string }> = {
  act_now: { dot: "bg-[color:var(--bad)]", label: "ACT NOW" },
  act_when_funding: { dot: "bg-[color:var(--accent)]", label: "ON NEXT $" },
  watch: { dot: "bg-[color:var(--warn)]", label: "WATCH" },
  info: { dot: "bg-[color:var(--text-faint)]", label: "INFO" },
};

const REC_LABEL: Record<RebalanceAction["recommendation"], string> = {
  direct_new_contributions: "Direct new $",
  trim_in_tax_advantaged: "Trim in Roth (no tax)",
  consider_trim_taxable: "Consider trim (taxable)",
  harvest_loss: "Harvest loss + rebalance",
  hold: "Hold",
};

export default function DriftPanel({ alerts: _alerts, bare }: { alerts?: unknown[]; bare?: boolean } = {}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/rebalance")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setPlan(d); })
      .finally(() => setLoading(false));
  }, []);

  if (loading && !plan) return <div className={`${bare ? "" : "card "}p-5 text-xs text-[color:var(--text-faint)]`}>Computing rebalance plan…</div>;
  if (!plan) return null;

  if (plan.actions.length === 0) {
    return (
      <div className={`${bare ? "" : "card "}p-5`}>
        {!bare && <h3 className="mb-2 text-sm font-semibold text-white">Rebalancing</h3>}
        <p className="text-xs text-[color:var(--good)]">{plan.summary}</p>
      </div>
    );
  }

  return (
    <div className={bare ? "overflow-hidden" : "card overflow-hidden"}>
      {!bare && (
        <div className="border-b border-[color:var(--border)] px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Rebalancing</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-faint)]">{plan.summary}</p>
        </div>
      )}
      {bare && plan.summary && (
        <p className="px-5 py-3 text-[11px] leading-relaxed text-[color:var(--text-faint)]">{plan.summary}</p>
      )}

      {plan.next_contribution_guidance.by_ticker.length > 0 && (
        <div className="border-b border-[color:var(--border)] bg-[color:var(--accent-soft)] px-5 py-3">
          <p className="text-[10px] uppercase tracking-wider text-[color:var(--accent)]">Next contribution split</p>
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {plan.next_contribution_guidance.by_ticker.map((u) => (
              <li key={u.ticker} className="flex justify-between">
                <span className="font-mono font-medium text-white">{u.ticker}</span>
                <span className="num text-[color:var(--text-dim)]">
                  <span className="text-white">${u.needed_usd.toFixed(0)}</span>
                  <span className="ml-2 text-[10px]">(close {u.weight_to_close.toFixed(1)}% drift)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="divide-y divide-[color:var(--border-muted)]">
        {plan.actions.map((a) => {
          const sev = SEVERITY_STYLE[a.severity];
          return (
            <li key={a.ticker} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${sev.dot}`} />
                  <span className="font-mono text-sm font-semibold text-white">{a.ticker}</span>
                  <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">{sev.label}</span>
                  <span className="chip">{a.account}</span>
                  {a.cap_violation && (
                    <span className="chip text-[color:var(--bad)]" style={{ background: "var(--bad-soft)" }}>
                      cap: {a.cap_violation.limit_pct}%
                    </span>
                  )}
                </div>
                <span className="num text-[11px] text-[color:var(--text-dim)]">
                  <span className={a.drift_pct >= 0 ? "text-[color:var(--warn)]" : "text-[color:var(--accent)]"}>
                    {a.drift_pct >= 0 ? "+" : ""}{a.drift_pct.toFixed(1)}%
                  </span>
                  <span className="ml-1 text-[color:var(--text-faint)]">vs {a.target_weight_pct}%</span>
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-[color:var(--accent)]">{REC_LABEL[a.recommendation]}</p>
              <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-dim)]">{a.rationale}</p>
              {a.tax_note && <p className="mt-1 text-[10px] italic text-[color:var(--text-faint)]">{a.tax_note}</p>}
              {a.wash_sale_blocked && (
                <p className="mt-1 text-[10px] text-[color:var(--warn)]">⚠ Wash-sale window active. See Income tab.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
