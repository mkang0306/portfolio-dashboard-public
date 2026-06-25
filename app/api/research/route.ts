import { NextRequest, NextResponse } from "next/server";
import { runResearch } from "@/lib/research";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "missing ticker" }, { status: 400 });
  try {
    const result = await runResearch(ticker.toUpperCase());
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
