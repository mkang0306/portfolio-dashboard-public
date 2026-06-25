import { NextRequest, NextResponse } from "next/server";
import { loadHoldings } from "@/lib/holdings";
import { fetchHistory } from "@/lib/sources/history";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_PERIODS = new Set(["1d", "5d", "1mo", "3mo", "1y", "5y", "max"]);
const VALID_BENCHMARKS = new Set(["SPY", "QQQ", "VTI", "DIA", "IWM", "ACWI"]);

interface SeriesPoint {
  t: string; // ISO timestamp
  portfolio: number;
  [benchmark: string]: number | string;
}

export async function GET(req: NextRequest) {
  try {
    const period = req.nextUrl.searchParams.get("period") ?? "1mo";
    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: `invalid period: ${period}` }, { status: 400 });
    }
    const benchmarksParam = req.nextUrl.searchParams.get("benchmarks") ?? "";
    const benchmarks = benchmarksParam
      .split(",")
      .map((b) => b.trim().toUpperCase())
      .filter((b) => VALID_BENCHMARKS.has(b));

    const { holdings } = loadHoldings();
    const portfolioTickers = holdings.map((h) => h.ticker);
    const allTickers = Array.from(new Set([...portfolioTickers, ...benchmarks]));

    const hist = await fetchHistory(period, allTickers);
    if (!hist.timestamps.length) {
      return NextResponse.json({ series: [], period, benchmarks });
    }

    // Compute portfolio value at each timestamp = sum(shares * price_at_t)
    const shareMap = new Map(holdings.map((h) => [h.ticker, h.shares]));
    const series: SeriesPoint[] = hist.timestamps.map((t, i) => {
      let portfolio = 0;
      for (const ticker of portfolioTickers) {
        const px = hist.prices[ticker]?.[i];
        if (px != null) portfolio += px * (shareMap.get(ticker) ?? 0);
      }
      const point: SeriesPoint = { t, portfolio: Math.round(portfolio * 100) / 100 };
      // Normalize benchmarks to start at portfolio's starting value
      for (const b of benchmarks) {
        const bPrices = hist.prices[b];
        if (!bPrices || bPrices[0] == null) continue;
        const startBench = bPrices[0]!;
        const startPort = i === 0 ? portfolio : 0; // recompute startPort below
        // Compute proper startPort once
        if (i === 0) {
          point[b] = Math.round(portfolio * 100) / 100;
        } else {
          // We'll patch this in a second pass since startPort isn't known here
          const v = bPrices[i];
          if (v != null) point[b] = (v / startBench) * 0; // placeholder
          else point[b] = 0;
        }
        void startPort;
      }
      return point;
    });

    // Second pass for benchmark normalization (we need start portfolio value, which is series[0].portfolio)
    const startPort = series[0]?.portfolio ?? 0;
    for (const b of benchmarks) {
      const bPrices = hist.prices[b];
      if (!bPrices) continue;
      const startBench = bPrices.find((v) => v != null);
      if (!startBench) continue;
      for (let i = 0; i < series.length; i++) {
        const v = bPrices[i];
        series[i][b] = v != null ? Math.round((v / startBench) * startPort * 100) / 100 : 0;
      }
    }

    return NextResponse.json({ series, period, benchmarks });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
