import type { Holding, PortfolioRules } from "./holdings";
export type { PortfolioRules, SellTrigger, StructuredSellTrigger, SellTriggerType } from "./holdings";
import type { PriceMap } from "./prices";

export interface Position extends Holding {
  price: number | null;
  prev_close: number | null;
  value: number;
  weight_pct: number;
  drift_pct: number;
  day_change_pct: number | null;
  unrealized_pl: number | null;
  unrealized_pl_pct: number | null;
}

export interface PortfolioState {
  positions: Position[];
  total_value: number;
  day_change_pct: number | null;
  by_account: Record<string, number>;
  alerts: Alert[];
}

export type AlertKind = "drift" | "position_cap" | "amzn_cap" | "single_name_cap" | "missing_price";
export interface Alert {
  kind: AlertKind;
  ticker: string;
  message: string;
  severity: "warn" | "info";
}

export function buildPortfolio(
  holdings: Holding[],
  prices: PriceMap,
  rules: PortfolioRules,
): PortfolioState {
  const priced = holdings.map((h) => {
    const q = prices[h.ticker];
    const price = q?.price ?? null;
    const prev = q?.prev_close ?? null;
    const value = price !== null ? price * h.shares : 0;
    const dayChangePct =
      price !== null && prev !== null && prev > 0 ? ((price - prev) / prev) * 100 : null;
    const pl =
      h.cost_basis !== null && price !== null ? price * h.shares - h.cost_basis : null;
    const plPct =
      h.cost_basis !== null && h.cost_basis > 0 && pl !== null ? (pl / h.cost_basis) * 100 : null;
    return { h, price, prev, value, dayChangePct, pl, plPct };
  });

  const totalValue = priced.reduce((s, p) => s + p.value, 0);
  const totalPrev = priced.reduce(
    (s, p) => s + (p.prev !== null ? p.prev * p.h.shares : p.value),
    0,
  );
  const dayChangePct =
    totalPrev > 0 ? ((totalValue - totalPrev) / totalPrev) * 100 : null;

  const positions: Position[] = priced.map((p) => {
    const weight = totalValue > 0 ? (p.value / totalValue) * 100 : 0;
    return {
      ...p.h,
      price: p.price,
      prev_close: p.prev,
      value: p.value,
      weight_pct: weight,
      drift_pct: weight - p.h.target_pct,
      day_change_pct: p.dayChangePct,
      unrealized_pl: p.pl,
      unrealized_pl_pct: p.plPct,
    };
  });

  const by_account: Record<string, number> = {};
  for (const p of positions) {
    by_account[p.account] = (by_account[p.account] ?? 0) + p.value;
  }

  const alerts: Alert[] = [];
  for (const p of positions) {
    if (p.price === null) {
      alerts.push({
        kind: "missing_price",
        ticker: p.ticker,
        severity: "warn",
        message: `No price returned for ${p.ticker}`,
      });
      continue;
    }
    if (Math.abs(p.drift_pct) >= rules.drift_threshold_pct) {
      alerts.push({
        kind: "drift",
        ticker: p.ticker,
        severity: "warn",
        message: `${p.ticker} is ${p.drift_pct > 0 ? "+" : ""}${p.drift_pct.toFixed(
          1,
        )}% from target (${p.target_pct}%)`,
      });
    }
    if (p.weight_pct > rules.max_position_pct) {
      alerts.push({
        kind: "position_cap",
        ticker: p.ticker,
        severity: "warn",
        message: `${p.ticker} (${p.weight_pct.toFixed(1)}%) exceeds 12% portfolio cap`,
      });
    }
    if (p.ticker === "AMZN" && p.weight_pct > rules.amzn_cap_pct) {
      alerts.push({
        kind: "amzn_cap",
        ticker: p.ticker,
        severity: "warn",
        message: `AMZN ${p.weight_pct.toFixed(1)}% exceeds 8% thesis cap`,
      });
    }
    const isSingleName = p.expense_ratio === null && p.ticker !== "AMZN";
    if (isSingleName && p.weight_pct > rules.single_name_cap_pct) {
      alerts.push({
        kind: "single_name_cap",
        ticker: p.ticker,
        severity: "warn",
        message: `${p.ticker} ${p.weight_pct.toFixed(1)}% exceeds 6% single-name cap`,
      });
    }
  }

  return { positions, total_value: totalValue, day_change_pct: dayChangePct, by_account, alerts };
}
