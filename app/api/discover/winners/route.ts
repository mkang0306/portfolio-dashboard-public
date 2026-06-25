import { NextRequest, NextResponse } from "next/server";
import { THEMES, allScreenerTickers } from "@/lib/themes";
import { fetchScreener, type ScreenerRow } from "@/lib/sources/screener";
import { loadHoldings } from "@/lib/holdings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Window = "1d" | "5d" | "1mo" | "3mo" | "1y" | "ytd";
const VALID_WINDOWS: Window[] = ["1d", "5d", "1mo", "3mo", "1y", "ytd"];

interface ThemeBlock {
  key: string;
  label: string;
  description: string;
  rows: Array<{
    ticker: string;
    held: boolean;
    price: number | null;
    return_pct: number | null;
    pct_off_high: number | null;
    near_52w_high: boolean;
  }>;
}

export async function GET(req: NextRequest) {
  try {
    const win = (req.nextUrl.searchParams.get("window") ?? "1mo") as Window;
    if (!VALID_WINDOWS.includes(win)) {
      return NextResponse.json({ error: `invalid window: ${win}` }, { status: 400 });
    }

    const { holdings } = loadHoldings();
    const heldSet = new Set(holdings.map((h) => h.ticker.toUpperCase()));
    const tickers = allScreenerTickers();
    const data = await fetchScreener(tickers);

    const themes: ThemeBlock[] = THEMES.map((t) => {
      const rows = t.universe
        .map((tk) => {
          const r: ScreenerRow | undefined = data[tk];
          const ret = r?.returns?.[win] ?? null;
          const pctOff = r?.pct_off_high ?? null;
          return {
            ticker: tk,
            held: heldSet.has(tk),
            price: r?.price ?? null,
            return_pct: ret,
            pct_off_high: pctOff,
            near_52w_high: pctOff !== null && pctOff > -3, // within 3% of 52w high
          };
        })
        .filter((r) => r.return_pct !== null)
        .sort((a, b) => (b.return_pct ?? -Infinity) - (a.return_pct ?? -Infinity))
        .slice(0, 6);
      return {
        key: t.key,
        label: t.label,
        description: t.description,
        rows,
      };
    });

    return NextResponse.json({ window: win, themes });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
