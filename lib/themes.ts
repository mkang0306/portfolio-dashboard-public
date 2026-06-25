// Theme universes for the Discover screener. Each theme groups your existing positions
// with a curated list of "in the same fight" tickers we'll scan for winners.

export interface Theme {
  key: string;
  label: string;
  description: string;
  universe: string[]; // tickers to screen
  holdings: string[]; // your existing holdings in this theme (highlighted in results)
}

export const THEMES: Theme[] = [
  {
    key: "mag7_ai",
    label: "Mag 7 + AI compute",
    description: "Large-cap tech driving AI capex + hyperscaler platforms",
    holdings: ["AAPL", "AMZN", "META", "NVDA", "GOOGL", "MSFT"],
    universe: [
      "AAPL", "AMZN", "META", "NVDA", "GOOGL", "MSFT", "TSLA",
      // AI compute adjacents
      "AMD", "AVGO", "TSM", "ASML", "ARM", "MRVL", "AMAT", "LRCX", "KLAC",
      // Hyperscaler-adjacent / AI software
      "ORCL", "CRM", "NOW", "PLTR", "SNOW", "DDOG",
    ],
  },
  {
    key: "memory",
    label: "Memory / HBM cycle",
    description: "DRAM, HBM, and memory-cycle exposure",
    holdings: ["DRAM"],
    universe: [
      "DRAM", "MU", "WDC", "STX",
      // Korean memory leaders (ADRs where available; otherwise via EWY)
      "EWY",
      // Memory equipment + adjacents
      "AMAT", "LRCX", "KLAC", "ENTG", "ACLS",
    ],
  },
  {
    key: "quantum",
    label: "Quantum compute",
    description: "Quantum + the semi supply chain enabling it",
    holdings: ["QTUM"],
    universe: [
      "QTUM",
      "IONQ", "RGTI", "QBTS", "ARQQ",
      "IBM", "GOOGL", "MSFT", "HON",
      "NVDA", "AMD", "INTC",
    ],
  },
  {
    key: "korea",
    label: "Korea / EM Asia",
    description: "South Korea reform + memory cycle + EM-Asia exposure",
    holdings: ["EWY"],
    universe: [
      "EWY", "KORU", "FLKR",
      // Korean ADRs
      "KB", "SHG", "KEP", "POSC",
      // Adjacents
      "EEM", "VWO", "MCHI", "FXI", "INDA",
    ],
  },
  {
    key: "intl_dev",
    label: "International developed",
    description: "Ex-US developed markets (Europe, Japan)",
    holdings: ["VXUS"],
    universe: [
      "VXUS", "IXUS", "VEA", "IEFA", "SCHF",
      "EWJ", "EWG", "EWQ", "EWU",
      "ACWX",
    ],
  },
  {
    key: "us_core",
    label: "US broad market core",
    description: "Total-US-market index funds (your VTI / AVUS layer)",
    holdings: ["VTI", "AVUS"],
    universe: [
      "VTI", "AVUS", "SCHB", "ITOT", "VOO", "SPY", "IVV",
      "AVGE", "DFAU",
    ],
  },
  {
    key: "small_value",
    label: "Small-cap value (factor)",
    description: "Fama-French small-cap value premium",
    holdings: ["AVUV"],
    universe: [
      "AVUV", "DFSV", "IJS", "VBR", "AVDV",
      "QSML", "CALF",
    ],
  },
  {
    key: "hedge",
    label: "Inflation / crisis hedge",
    description: "Gold, real assets, currency-debasement plays",
    holdings: ["GLD"],
    universe: [
      "GLD", "IAU", "SGOL", "GLDM",
      "SLV", "PSLV", "PALL",
      "IAUM", "DBC", "PDBC",
    ],
  },
];

/** Map a holding ticker -> the themes it belongs to (a ticker may be in multiple). */
export function themesFor(ticker: string): Theme[] {
  return THEMES.filter((t) => t.universe.includes(ticker.toUpperCase()));
}

/** All unique tickers across all themes (for batched screener calls). */
export function allScreenerTickers(): string[] {
  const set = new Set<string>();
  for (const t of THEMES) for (const u of t.universe) set.add(u);
  return Array.from(set);
}
