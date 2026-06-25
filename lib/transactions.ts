import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export interface Transaction {
  date: string;
  ticker: string;
  action: "buy" | "sell";
  shares: number;
  price: number;
  amount: number;
  drip: boolean;
}

export interface Dividend {
  date: string;
  ticker: string;
  amount: number;
  ex_date?: string;
  pay_date?: string;
  shares_at_record?: number;
  per_share?: number;
}

export type CashflowType = "ACH" | "ITRF" | "INT" | "GDBP" | "GMPC" | "GOLD";

export interface Cashflow {
  date: string;
  type: CashflowType;
  amount: number;
  description: string;
}

const DATA = path.join(process.cwd(), "data");

function readYaml<T>(file: string, key: string): T[] {
  const fullPath = path.join(DATA, file);
  if (!fs.existsSync(fullPath)) return [];
  const blob = yaml.load(fs.readFileSync(fullPath, "utf8")) as Record<string, T[]>;
  return blob[key] ?? [];
}

export function loadTransactions(): Transaction[] {
  return readYaml<Transaction>("transactions.yaml", "transactions");
}

export function loadDividends(): Dividend[] {
  return readYaml<Dividend>("dividends.yaml", "dividends");
}

export function loadCashflows(): Cashflow[] {
  return readYaml<Cashflow>("cashflows.yaml", "cashflows");
}
