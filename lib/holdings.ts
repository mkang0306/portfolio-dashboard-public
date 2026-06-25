import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export type Account = "taxable" | "roth";

export type SellTriggerType = "thesis_break" | "drift" | "opportunity";

export interface StructuredSellTrigger {
  type: SellTriggerType;
  condition: string;
  fired?: boolean; // set during quarterly review
  fired_date?: string;
}

// Backward-compatible: sell_triggers can be string[] (legacy) or StructuredSellTrigger[]
export type SellTrigger = string | StructuredSellTrigger;

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  cost_basis: number | null;
  account: Account;
  target_pct: number;
  expense_ratio: number | null;
  function: string;
  thesis: string;
  sell_triggers: SellTrigger[];
}

export interface PortfolioRules {
  max_position_pct: number;
  amzn_cap_pct: number;
  single_name_cap_pct: number;
  drift_threshold_pct: number;
  roth_contribution_target: number;
}

export interface HoldingsFile {
  portfolio_rules: PortfolioRules;
  holdings: Holding[];
}

const HOLDINGS_PATH = path.join(process.cwd(), "data", "holdings.yaml");

export function loadHoldings(): HoldingsFile {
  const raw = fs.readFileSync(HOLDINGS_PATH, "utf8");
  return yaml.load(raw) as HoldingsFile;
}

export function loadThesis(): string {
  return fs.readFileSync(path.join(process.cwd(), "data", "thesis.md"), "utf8");
}
