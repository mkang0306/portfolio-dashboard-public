import { NextResponse } from "next/server";
import { loadTransactions } from "@/lib/transactions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ transactions: loadTransactions() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, transactions: [] }, { status: 500 });
  }
}
