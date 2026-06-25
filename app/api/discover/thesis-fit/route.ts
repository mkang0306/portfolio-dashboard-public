import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { declinedTickers } from "@/lib/notes";

export const dynamic = "force-dynamic";

const DISCOVER_DIR = path.join(process.cwd(), "discover");
const LATEST = path.join(DISCOVER_DIR, "latest-thesis-fit.json");

export async function GET() {
  try {
    if (!fs.existsSync(LATEST)) {
      return NextResponse.json({ available: false });
    }
    const data = JSON.parse(fs.readFileSync(LATEST, "utf8"));

    // Filter out declined tickers from all sections
    const declined = declinedTickers();
    if (declined.size > 0) {
      if (data.candidates) {
        data.candidates = data.candidates.filter(
          (c: { ticker?: string }) => !declined.has(c.ticker ?? "")
        );
      }
      if (data.adjacent) {
        data.adjacent = data.adjacent.filter(
          (a: { candidate?: string }) => !declined.has(a.candidate ?? "")
        );
      }
      if (data.etf_replacements) {
        data.etf_replacements = data.etf_replacements.filter(
          (r: { alternative?: string }) => !declined.has(r.alternative ?? "")
        );
      }
      if (data.consolidation) {
        data.consolidation = data.consolidation.filter(
          (c: { proposal?: string }) => {
            // Filter if any declined ticker appears in the proposal text
            const text = (c.proposal ?? "").toUpperCase();
            for (const t of declined) {
              if (text.includes(t)) return false;
            }
            return true;
          }
        );
      }
    }

    // Find the markdown file date
    const files = fs.existsSync(DISCOVER_DIR)
      ? fs.readdirSync(DISCOVER_DIR).filter((f) => f.endsWith("-thesis-fit.md")).sort().reverse()
      : [];
    const date = files[0]?.replace("-thesis-fit.md", "") ?? "-";
    return NextResponse.json({ available: true, date, ...data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, available: false }, { status: 500 });
  }
}
