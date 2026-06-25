// Tax-loss harvesting analysis.
// Patterns ported from .claude/skills/wealth-management/skills/tax-loss-harvesting/SKILL.md
// Honors: wash-sale lookback (30d), DRIP awareness, ST/LT classification, realized P/L budget.
//
// Disclaimer: not tax advice. Verify everything with your CPA before realizing any loss.

import type { Position } from "./portfolio";
import type { Transaction } from "./transactions";

// ---------------- Replacement securities (wash-sale-safe) ----------------
// "Substantially identical" = same security, NOT same asset class. Different fund
// family or different index methodology is generally safe per industry consensus.

export interface PartnerSuggestion {
  ticker: string;
  rationale: string;
  tracking_error: "minimal" | "low" | "moderate";
}

export const WASH_SAFE_PARTNERS: Record<string, PartnerSuggestion[]> = {
  // Mag 7 — replace with siblings that share theme but aren't substantially identical
  MSFT: [
    { ticker: "GOOGL", rationale: "Cloud + AI distribution (Google Cloud), different company", tracking_error: "moderate" },
    { ticker: "AMZN",  rationale: "AWS cloud leader, captures cloud-AI theme", tracking_error: "moderate" },
    { ticker: "ORCL",  rationale: "Pure enterprise cloud play, different company", tracking_error: "moderate" },
  ],
  AMZN: [
    { ticker: "MSFT",  rationale: "Cloud (Azure) overlap, different company", tracking_error: "moderate" },
    { ticker: "GOOGL", rationale: "Cloud + ad-tech overlap, different company", tracking_error: "moderate" },
  ],
  GOOGL: [
    { ticker: "META", rationale: "Ad-tech overlap, different company", tracking_error: "moderate" },
    { ticker: "MSFT", rationale: "Cloud + enterprise AI, different company", tracking_error: "moderate" },
  ],
  META: [
    { ticker: "GOOGL", rationale: "Ad-tech overlap, different company", tracking_error: "moderate" },
    { ticker: "SNAP",  rationale: "Smaller social-ad-tech proxy", tracking_error: "moderate" },
  ],
  NVDA: [
    { ticker: "AMD",   rationale: "AI accelerator competitor, captures AI compute theme", tracking_error: "moderate" },
    { ticker: "AVGO",  rationale: "AI silicon + networking, different company", tracking_error: "moderate" },
    { ticker: "TSM",   rationale: "AI chip foundry, picks up upstream exposure", tracking_error: "moderate" },
  ],
  AAPL: [
    { ticker: "MSFT", rationale: "Different mega-cap with services moat", tracking_error: "moderate" },
  ],
  // ETFs
  VTI: [
    { ticker: "ITOT", rationale: "iShares Core S&P Total US Stock — different index family (S&P vs CRSP)", tracking_error: "minimal" },
    { ticker: "SCHB", rationale: "Schwab US Broad Market — different index", tracking_error: "minimal" },
  ],
  VXUS: [
    { ticker: "IXUS", rationale: "iShares Core MSCI Total International — different fund family", tracking_error: "minimal" },
    { ticker: "ACWX", rationale: "iShares MSCI ACWI ex-US — different index methodology", tracking_error: "low" },
  ],
  AVUS: [
    { ticker: "DFAU", rationale: "Dimensional US Core Equity Market — sibling factor methodology", tracking_error: "low" },
    { ticker: "DFLV", rationale: "Dimensional US Large Cap Value — narrower factor cut", tracking_error: "low" },
  ],
  AVUV: [
    { ticker: "DFSV", rationale: "Dimensional US Small Cap Value — sibling factor", tracking_error: "low" },
    { ticker: "IJS",  rationale: "iShares S&P SmallCap 600 Value — passive, different index", tracking_error: "low" },
  ],
  GLD: [
    { ticker: "IAU",  rationale: "iShares Gold Trust — different fund family, lower ER", tracking_error: "minimal" },
    { ticker: "SGOL", rationale: "abrdn Physical Gold — different sponsor", tracking_error: "minimal" },
  ],
  EWY: [
    { ticker: "KORU", rationale: "Direxion 3x leveraged South Korea — different fund (leveraged ≠ identical)", tracking_error: "moderate" },
    { ticker: "FLKR", rationale: "Franklin FTSE South Korea — different index, lower ER", tracking_error: "low" },
  ],
  DRAM: [
    { ticker: "MU",   rationale: "Micron — direct memory exposure, single stock", tracking_error: "moderate" },
    { ticker: "SOXX", rationale: "iShares Semiconductor — broader chip exposure including memory", tracking_error: "moderate" },
  ],
  QTUM: [
    { ticker: "IONQ", rationale: "Pure-play quantum, single stock", tracking_error: "moderate" },
    { ticker: "SOXX", rationale: "Semi-supply-chain proxy", tracking_error: "moderate" },
  ],
};

// "Substantially identical" alias detection (multi-class shares, ADR pairs, etc.)
const SAME_ISSUER_ALIASES: Record<string, string[]> = {
  GOOG: ["GOOGL"], GOOGL: ["GOOG"],
};

function sameIssuer(a: string, b: string): boolean {
  if (a === b) return true;
  return (SAME_ISSUER_ALIASES[a] ?? []).includes(b);
}

// ---------------- Holding period (ST vs LT) ----------------

// IRS: "more than one year" = strictly > 365 days. Use 366 to be on the safe side
// (leap years technically push this to 366, but the IRS rule counts calendar days).
const ONE_YEAR_PLUS_ONE_DAY_MS = 366 * 24 * 60 * 60 * 1000;

export interface HoldingPeriodInfo {
  earliest_known_buy: string | null;
  days_held: number | null;
  classification: "short_term" | "long_term" | "mixed" | "unknown";
  notes: string;
}

export function computeHoldingPeriod(ticker: string, transactions: Transaction[]): HoldingPeriodInfo {
  // Treat same-issuer aliases (GOOG/GOOGL) as one position for holding-period purposes too
  const buys = transactions
    .filter((t) => sameIssuer(ticker, t.ticker) && t.action === "buy")
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (buys.length === 0) {
    return {
      earliest_known_buy: null, days_held: null, classification: "unknown",
      notes: "No buy transactions in window — position likely opened before transaction history starts. Likely long-term, verify with brokerage.",
    };
  }
  const earliest = buys[0].date;
  const ageMs = Date.now() - new Date(earliest).getTime();
  const days = Math.floor(ageMs / 86400000);
  // IRS LT = "more than one year" from acquisition; use strict >
  const isLT = ageMs > ONE_YEAR_PLUS_ONE_DAY_MS;
  const sells = transactions.filter((t) => sameIssuer(ticker, t.ticker) && t.action === "sell");
  const hasMultipleLots = buys.length > 1 || sells.length > 0;
  return {
    earliest_known_buy: earliest,
    days_held: days,
    classification: hasMultipleLots ? "mixed" : (isLT ? "long_term" : "short_term"),
    notes: hasMultipleLots
      ? "Multiple lots — actual classification varies. Brokerage uses your default lot method (FIFO unless changed)."
      : `Single lot opened ${earliest}. ${days} days held → ${isLT ? "LT" : "ST"} treatment.`,
  };
}

// ---------------- Wash-sale window check ----------------

const WASH_SALE_WINDOW_DAYS = 30;

export interface WashSaleStatus {
  blocked: boolean;
  recent_buys: { date: string; shares: number; price: number; drip: boolean }[];
  blocked_until: string | null;
  drip_active: boolean;
  notes: string[];
}

export function checkWashSale(ticker: string, transactions: Transaction[]): WashSaleStatus {
  const now = Date.now();
  const cutoffMs = now - WASH_SALE_WINDOW_DAYS * 86400000;
  const recent = transactions
    .filter((t) => sameIssuer(ticker, t.ticker) && t.action === "buy" && new Date(t.date).getTime() >= cutoffMs)
    .map((t) => ({ date: t.date, shares: t.shares, price: t.price, drip: t.drip }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const drip_active = transactions.some(
    (t) => sameIssuer(ticker, t.ticker) && t.action === "buy" && t.drip,
  );
  const notes: string[] = [];
  if (recent.length > 0) {
    const latest = recent[0].date;
    const blockedUntilMs = new Date(latest).getTime() + WASH_SALE_WINDOW_DAYS * 86400000;
    const blockedUntil = new Date(blockedUntilMs).toISOString().slice(0, 10);
    notes.push(`Recent buy on ${latest} blocks loss harvest — wash-sale window runs through ~${blockedUntil}.`);
    if (recent.some((r) => r.drip)) {
      notes.push("Includes DRIP — disable dividend reinvestment before harvesting or the next ex-div triggers a wash sale.");
    }
    return { blocked: true, recent_buys: recent, blocked_until: blockedUntil, drip_active, notes };
  }
  if (drip_active) {
    notes.push("DRIP active — sell only if you can disable reinvestment before next ex-div, otherwise the auto-buy triggers wash sale.");
  }
  return { blocked: false, recent_buys: [], blocked_until: null, drip_active, notes };
}

// ---------------- YTD realized gain/loss budget ----------------

export interface RealizedLedger {
  year: number;
  realized_pl_ytd_estimate: number | null;
  caveat: string;
}

/**
 * Compute YTD realized P/L using FIFO lot matching.
 * For each sell, walk chronologically through the ticker's prior buys and consume shares.
 * If a sell tries to consume more shares than the in-window buys can cover, that sell's
 * cost basis is unknown (the original lots predate our transaction history) and we
 * mark coverage as incomplete.
 *
 * Returns:
 *   - estimate: P/L from fully-covered sells only
 *   - per_ticker_coverage: per-ticker breakdown of what was covered vs not
 *   - any_uncovered: whether the estimate is missing some sells (so it's a lower bound)
 */
export function computeRealizedYtd(transactions: Transaction[]): RealizedLedger {
  const year = new Date().getFullYear();
  // Chronological order matters for FIFO
  const ytd = [...transactions]
    .filter((t) => t.date.startsWith(`${year}`) && t.ticker)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // Per-ticker lot queue (oldest first)
  interface Lot { shares: number; cost_per_share: number; date: string }
  const lots = new Map<string, Lot[]>();
  let realized_from_covered_sells = 0;
  const uncovered_tickers: string[] = [];

  for (const t of ytd) {
    if (t.action === "buy") {
      const list = lots.get(t.ticker) ?? [];
      // For DRIP / buy: cost = -amount / shares. Robinhood amount is negative for buys.
      const cost_per_share = t.shares > 0 ? -t.amount / t.shares : t.price;
      list.push({ shares: t.shares, cost_per_share, date: t.date });
      lots.set(t.ticker, list);
    } else if (t.action === "sell") {
      // FIFO: consume from oldest lot first
      const list = lots.get(t.ticker) ?? [];
      let remaining = t.shares;
      let cost_basis_of_sold = 0;
      let covered = true;
      while (remaining > 0 && list.length > 0) {
        const lot = list[0];
        const take = Math.min(remaining, lot.shares);
        cost_basis_of_sold += take * lot.cost_per_share;
        lot.shares -= take;
        remaining -= take;
        if (lot.shares === 0) list.shift();
      }
      if (remaining > 0.0001) {
        // Sold more shares than in-window buys can cover → pre-window lot
        covered = false;
        if (!uncovered_tickers.includes(t.ticker)) uncovered_tickers.push(t.ticker);
      }
      if (covered) {
        // proceeds = +amount (positive for sells)
        realized_from_covered_sells += t.amount - cost_basis_of_sold;
      }
    }
  }

  const has_uncovered = uncovered_tickers.length > 0;
  return {
    year,
    realized_pl_ytd_estimate: Math.round(realized_from_covered_sells * 100) / 100,
    caveat: has_uncovered
      ? `Lower bound only — sells of ${uncovered_tickers.join(", ")} reference lots from before the transaction history window. Real realized P/L is higher in absolute terms. Pull from brokerage 1099-B for the true number.`
      : "FIFO-matched from in-window transactions. Verify with brokerage 1099-B for tax filing.",
  };
}

// ---------------- Harvest opportunity (top-level entry point) ----------------

export interface HarvestOpportunity {
  ticker: string;
  name: string;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  holding_period: HoldingPeriodInfo;
  wash_sale: WashSaleStatus;
  replacements: PartnerSuggestion[];
  est_tax_savings_short_term: number;
  est_tax_savings_long_term: number;
  priority_rank: number;
}

export interface TaxAssumptions {
  marginal_ordinary_rate_pct: number;
  long_term_capital_gains_rate_pct: number;
}

export const DEFAULT_TAX_ASSUMPTIONS: TaxAssumptions = {
  marginal_ordinary_rate_pct: 32,
  long_term_capital_gains_rate_pct: 15,
};

const MIN_LOSS_USD = 50;

export function buildHarvestOpportunities(
  positions: Position[],
  transactions: Transaction[],
  assumptions: TaxAssumptions = DEFAULT_TAX_ASSUMPTIONS,
): HarvestOpportunity[] {
  const losers = positions.filter(
    (p) => p.unrealized_pl !== null && p.unrealized_pl <= -MIN_LOSS_USD,
  );
  const opportunities = losers.map((p) => {
    const holding = computeHoldingPeriod(p.ticker, transactions);
    const wash = checkWashSale(p.ticker, transactions);
    const loss = Math.abs(p.unrealized_pl ?? 0);
    // Replacement lookup: try ticker, then aliases (GOOG → GOOGL key, etc.)
    let replacements = WASH_SAFE_PARTNERS[p.ticker] ?? [];
    if (replacements.length === 0) {
      for (const alias of SAME_ISSUER_ALIASES[p.ticker] ?? []) {
        if (WASH_SAFE_PARTNERS[alias]) { replacements = WASH_SAFE_PARTNERS[alias]; break; }
      }
    }
    return {
      ticker: p.ticker,
      name: p.name,
      unrealized_pl: p.unrealized_pl as number,
      unrealized_pl_pct: p.unrealized_pl_pct ?? 0,
      holding_period: holding,
      wash_sale: wash,
      replacements,
      est_tax_savings_short_term: loss * assumptions.marginal_ordinary_rate_pct / 100,
      est_tax_savings_long_term: loss * assumptions.long_term_capital_gains_rate_pct / 100,
      priority_rank: 0,
    };
  });

  // Skill rubric: prioritize by (1) largest absolute loss [biggest tax benefit],
  // (2) ST over LT [higher-value loss at ordinary income rates], (3) largest % loss [least likely to recover]
  opportunities.sort((a, b) => {
    const al = Math.abs(a.unrealized_pl), bl = Math.abs(b.unrealized_pl);
    if (al !== bl) return bl - al;
    const aST = a.holding_period.classification === "short_term" ? 0 : 1;
    const bST = b.holding_period.classification === "short_term" ? 0 : 1;
    if (aST !== bST) return aST - bST;
    return a.unrealized_pl_pct - b.unrealized_pl_pct;
  });
  opportunities.forEach((o, i) => (o.priority_rank = i + 1));
  return opportunities;
}
