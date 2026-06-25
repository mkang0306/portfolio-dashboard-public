import { NextRequest, NextResponse } from "next/server";
import { loadJournal, saveJournal } from "@/lib/notes";

export const dynamic = "force-dynamic";

/** POST: add a new journal entry. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, tags, body: entryBody } = body as {
      ticker?: string;
      tags?: string[];
      body: string;
    };

    if (!entryBody || !entryBody.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const entries = loadJournal();
    const newEntry = {
      date: new Date().toISOString().slice(0, 10),
      ticker: ticker?.toUpperCase() ?? null,
      tags: tags ?? [],
      body: entryBody.trim(),
    };

    entries.unshift(newEntry);
    saveJournal(entries);
    return NextResponse.json({ ok: true, entry: newEntry }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
