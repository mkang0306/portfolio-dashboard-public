// Tax-aware rebalancing plan generator.
// Patterns ported from .claude/skills/wealth-management/skills/portfolio-rebalance/SKILL.md
// Honors Minho's written discipline rules:
//   - ±5% drift threshold (skill: ±3-5% is typical band)
//   - "Rebalance via new contributions before selling" (skill: "direct new contributions to underweight")
//   - 12% portfolio cap, AMZN 8%, single-name 6%
//   - Don't sell on volatility — only on thesis breaks (skill: "don't rebalance for rebalancing's sake")
// Plus tax-aware patterns from the skill:
//   - Prefer Roth/IRA over taxable for any forced selling
//   - Coordinate wash-sale across accounts
//   - Harvest losses simultaneously where possible

import type { Position, PortfolioRules } from "./portfolio";
import type { Transaction } from "./transactions";
import { checkWashSale } from "./tax_loss";

export type Severity = "info" | "watch" | "act_when_funding" | "act_now";

export interface RebalanceAction {
  ticker: string;
  name: string;
  account: string;
  current_weight_pct: number;
  target_weight_pct: number;
  drift_pct: number;
  drift_usd: number;
  cap_violation: { kind: "portfolio" | "amzn" | "single_name"; limit_pct: number } | null;
  recommendation: "direct_new_contributions" | "trim_in_tax_advantaged" | "consider_trim_taxable" | "harvest_loss" | "hold";
  severity: Severity;
  rationale: string;
  tax_note: string;
  est_trim_shares: number | null;
  wash_sale_blocked: boolean;
}

export interface RebalancingPlan {
  any_action_required: boolean;
  // What to do with the next contribution dollars (per skill: prefer new money over selling)
  next_contribution_guidance: {
    total_underweight_usd: number;
    by_ticker: { ticker: string; needed_usd: number; weight_to_close: number }[];
  };
  actions: RebalanceAction[];
  summary: string;
}

const DRIFT_BAND_PCT = 5;       // matches discipline rule #3
const URGENT_DRIFT_PCT = 8;     // skill: ±3-5% typical; we use 5/8 split for severity

export function buildRebalancingPlan(
  positions: Position[],
  rules: PortfolioRules,
  transactions: Transaction[],
): RebalancingPlan {
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const actions: RebalanceAction[] = [];
  const underweight: { ticker: string; needed_usd: number; weight_to_close: number }[] = [];

  for (const p of positions) {
    const drift_pct = p.weight_pct - p.target_pct;
    const drift_usd = (drift_pct / 100) * totalValue;
    const isAmzn = p.ticker === "AMZN";
    const isSingleName = p.expense_ratio === null && !isAmzn;
    // Caps check (independent of drift)
    let cap_violation: RebalanceAction["cap_violation"] = null;
    let cap_limit = rules.max_position_pct;
    if (isAmzn && p.weight_pct > rules.amzn_cap_pct) {
      cap_violation = { kind: "amzn", limit_pct: rules.amzn_cap_pct };
      cap_limit = rules.amzn_cap_pct;
    } else if (isSingleName && p.weight_pct > rules.single_name_cap_pct) {
      cap_violation = { kind: "single_name", limit_pct: rules.single_name_cap_pct };
      cap_limit = rules.single_name_cap_pct;
    } else if (p.weight_pct > rules.max_position_pct && p.target_pct <= rules.max_position_pct) {
      // Portfolio cap only fires when current exceeds cap AND the target is below cap
      // (Avoids false-positive on VTI where target is 16% but discipline cap is 12% — that's a thesis inconsistency, not a drift issue)
      cap_violation = { kind: "portfolio", limit_pct: rules.max_position_pct };
      cap_limit = rules.max_position_pct;
    }

    const wash = checkWashSale(p.ticker, transactions);

    // No action if within band AND no cap violation
    if (Math.abs(drift_pct) < DRIFT_BAND_PCT && !cap_violation) {
      continue;
    }

    // Underweight: direct new contributions here
    if (drift_pct < -DRIFT_BAND_PCT) {
      const needed_usd = Math.abs(drift_usd);
      underweight.push({ ticker: p.ticker, needed_usd, weight_to_close: Math.abs(drift_pct) });
      actions.push({
        ticker: p.ticker, name: p.name, account: p.account,
        current_weight_pct: p.weight_pct, target_weight_pct: p.target_pct,
        drift_pct, drift_usd,
        cap_violation: null,
        recommendation: "direct_new_contributions",
        severity: "act_when_funding",
        rationale: `${p.ticker} is ${Math.abs(drift_pct).toFixed(1)}% below target. Need ~$${needed_usd.toFixed(0)} to close.`,
        tax_note: "No tax cost — uses new cash, no selling required.",
        est_trim_shares: null,
        wash_sale_blocked: false,
      });
      continue;
    }

    // Overweight or cap violation
    if (drift_pct > DRIFT_BAND_PCT || cap_violation) {
      const target_weight_for_trim = cap_violation ? cap_limit : p.target_pct;
      const target_value = (target_weight_for_trim / 100) * totalValue;
      const trim_value = Math.max(0, p.value - target_value);
      const est_trim_shares = p.price && p.price > 0 ? trim_value / p.price : null;

      // Loss → harvest
      if (p.unrealized_pl !== null && p.unrealized_pl < -50) {
        actions.push({
          ticker: p.ticker, name: p.name, account: p.account,
          current_weight_pct: p.weight_pct, target_weight_pct: p.target_pct,
          drift_pct, drift_usd, cap_violation,
          recommendation: "harvest_loss",
          severity: cap_violation || Math.abs(drift_pct) > URGENT_DRIFT_PCT ? "act_now" : "watch",
          rationale: `${p.ticker} is overweight AND below cost basis — rebalance + harvest in one move. See Income tab for wash-safe replacements.`,
          tax_note: "Harvest realizes the loss to offset future gains. Wash-sale check applies — see TLH details.",
          est_trim_shares,
          wash_sale_blocked: wash.blocked,
        });
        continue;
      }

      // Roth account → low-friction trim
      if (p.account === "roth") {
        actions.push({
          ticker: p.ticker, name: p.name, account: p.account,
          current_weight_pct: p.weight_pct, target_weight_pct: p.target_pct,
          drift_pct, drift_usd, cap_violation,
          recommendation: "trim_in_tax_advantaged",
          severity: cap_violation || Math.abs(drift_pct) > URGENT_DRIFT_PCT ? "act_now" : "watch",
          rationale: `${p.ticker} is overweight in Roth — trim ~${est_trim_shares?.toFixed(2)} shares ($${trim_value.toFixed(0)}) without tax cost.`,
          tax_note: "Roth = no capital-gains tax on the sale. Lowest-friction rebalance option.",
          est_trim_shares,
          wash_sale_blocked: false,
        });
        continue;
      }

      // Taxable + at gain → cautious trim, prefer new-contribution route instead
      actions.push({
        ticker: p.ticker, name: p.name, account: p.account,
        current_weight_pct: p.weight_pct, target_weight_pct: p.target_pct,
        drift_pct, drift_usd, cap_violation,
        recommendation: "consider_trim_taxable",
        severity: cap_violation ? "act_now" : Math.abs(drift_pct) > URGENT_DRIFT_PCT ? "watch" : "info",
        rationale: cap_violation
          ? `${p.ticker} (${p.weight_pct.toFixed(1)}%) exceeds the ${cap_violation.kind === "portfolio" ? "portfolio" : cap_violation.kind === "amzn" ? "AMZN" : "single-name"} cap of ${cap_violation.limit_pct}%. Per discipline rule, address this.`
          : `${p.ticker} is overweight by ${drift_pct.toFixed(1)}%. Prefer redirecting new contributions to underweight names first — sell only if drift persists past quarterly review.`,
        tax_note: p.unrealized_pl_pct !== null && p.unrealized_pl_pct > 0
          ? `Trimming realizes a gain of ~$${((p.unrealized_pl ?? 0) * (trim_value / p.value)).toFixed(0)} — ${p.unrealized_pl_pct?.toFixed(0)}% return. Check holding period for ST vs LT before selling.`
          : "Trim has minimal tax impact (near cost basis).",
        est_trim_shares,
        wash_sale_blocked: wash.blocked,
      });
    }
  }

  const total_underweight_usd = underweight.reduce((s, u) => s + u.needed_usd, 0);
  const any_action = actions.some((a) => a.severity === "act_now" || a.severity === "act_when_funding");

  // Sort: act_now first, then act_when_funding, then watch, then info
  const sevRank: Record<Severity, number> = { act_now: 0, act_when_funding: 1, watch: 2, info: 3 };
  actions.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || Math.abs(b.drift_pct) - Math.abs(a.drift_pct));

  const summary = actions.length === 0
    ? `All positions within ±${DRIFT_BAND_PCT}% of target and within caps. No rebalancing action needed — per the skill: "don't rebalance for rebalancing's sake."`
    : `${actions.length} drift/cap issue${actions.length === 1 ? "" : "s"}. ${
        underweight.length > 0
          ? `Next $${total_underweight_usd.toFixed(0)} of contributions should be directed to ${underweight.map((u) => u.ticker).join(", ")}.`
          : "All issues are overweight — see actions below."
      }`;

  return {
    any_action_required: any_action,
    next_contribution_guidance: { total_underweight_usd, by_ticker: underweight },
    actions,
    summary,
  };
}
