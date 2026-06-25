import type { Holding } from "./holdings";

export type CategoryScheme = "role" | "thesis" | "asset";

export interface Category {
  key: string;
  label: string;
  color: string;
}

const MAG7 = new Set(["AAPL", "AMZN", "META", "NVDA", "GOOGL", "MSFT"]);
const BROAD_ETF = new Set(["VTI", "AVUS", "AVUV", "VXUS"]);
const THEMATIC = new Set(["QTUM", "DRAM", "EWY"]);
const HEDGE = new Set(["GLD"]);

const COLORS = {
  blue: "#58a6ff",
  green: "#3fb950",
  amber: "#d29922",
  red: "#f85149",
  purple: "#a371f7",
  teal: "#39c5cf",
  gray: "#8b949e",
};

export function categoryFor(holding: Holding, scheme: CategoryScheme): Category {
  const t = holding.ticker;
  if (scheme === "role") {
    if (MAG7.has(t)) return { key: "mag7", label: "Mag 7", color: COLORS.blue };
    if (BROAD_ETF.has(t)) return { key: "broad", label: "Broad ETFs", color: COLORS.green };
    if (THEMATIC.has(t)) return { key: "thematic", label: "Thematic", color: COLORS.purple };
    if (HEDGE.has(t)) return { key: "hedge", label: "Hedge", color: COLORS.amber };
    return { key: "other", label: "Other", color: COLORS.gray };
  }
  if (scheme === "thesis") {
    if (new Set(["VTI", "VXUS", "EWY", "AVUS"]).has(t))
      return { key: "base", label: "Base Index", color: COLORS.green };
    if (MAG7.has(t) || t === "DRAM")
      return { key: "ai", label: "AI Compute", color: COLORS.blue };
    if (new Set(["AVUV", "QTUM"]).has(t))
      return { key: "factor", label: "Factor / Conviction", color: COLORS.purple };
    if (HEDGE.has(t)) return { key: "hedge", label: "Hedge", color: COLORS.amber };
    return { key: "other", label: "Other", color: COLORS.gray };
  }
  // asset class
  if (MAG7.has(t)) return { key: "us_stock", label: "US Stock", color: COLORS.blue };
  if (new Set(["VTI", "AVUS", "AVUV", "QTUM", "DRAM"]).has(t))
    return { key: "us_etf", label: "US ETF", color: COLORS.green };
  if (new Set(["VXUS", "EWY"]).has(t))
    return { key: "intl", label: "International", color: COLORS.teal };
  if (HEDGE.has(t)) return { key: "commodity", label: "Commodity", color: COLORS.amber };
  return { key: "other", label: "Other", color: COLORS.gray };
}

export const SCHEME_LABELS: Record<CategoryScheme, string> = {
  role: "By role",
  thesis: "By thesis layer",
  asset: "By asset class",
};
