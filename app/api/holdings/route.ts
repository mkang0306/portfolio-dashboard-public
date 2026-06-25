import { NextResponse } from "next/server";
import { loadHoldings } from "@/lib/holdings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(loadHoldings());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
