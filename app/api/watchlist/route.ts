import { NextRequest, NextResponse } from "next/server";
import {
  loadWatchlist, saveWatchlist,
  loadJournal, saveJournal,
  loadDeclined, saveDeclined,
  type WatchlistStatus,
} from "@/lib/notes";

export const dynamic = "force-dynamic";

const VALID_STATUSES: WatchlistStatus[] = ["watch", "consider", "queue", "declined"];

/** PATCH: update a single watchlist item by ticker.
 *  When status = "declined", the item is:
 *    1. Logged to the decision journal
 *    2. Added to declined.yaml (filters it from Discover)
 *    3. Removed from the watchlist
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, ...updates } = body as {
      ticker: string;
      status?: WatchlistStatus;
      note?: string;
      buy_if?: string | null;
      revisit_by?: string | null;
      target_size_pct?: number | null;
      tags?: string[];
    };

    if (!ticker) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 });
    }

    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
      return NextResponse.json({ error: `Invalid status: ${updates.status}` }, { status: 400 });
    }

    const items = loadWatchlist();
    const idx = items.findIndex((w) => w.ticker === ticker);
    if (idx === -1) {
      return NextResponse.json({ error: `Ticker ${ticker} not in watchlist` }, { status: 404 });
    }

    // Declining: journal + declined list + remove from watchlist
    if (updates.status === "declined") {
      const item = items[idx];
      const reason = updates.note ?? item.note ?? "";
      const today = new Date().toISOString().slice(0, 10);

      // 1. Add to decision journal
      const journal = loadJournal();
      journal.unshift({
        date: today,
        ticker,
        tags: ["declined"],
        body: reason.startsWith("DECLINED:") ? reason : `DECLINED: ${reason}`,
      });
      saveJournal(journal);

      // 2. Add to declined list
      const declined = loadDeclined();
      if (!declined.some((d) => d.ticker === ticker)) {
        declined.unshift({
          ticker,
          date: today,
          reason: reason.replace(/^DECLINED:\s*/i, ""),
        });
        saveDeclined(declined);
      }

      // 3. Remove from watchlist
      items.splice(idx, 1);
      saveWatchlist(items);

      return NextResponse.json({ ok: true, action: "declined", ticker });
    }

    // Normal update
    if (updates.status !== undefined) items[idx].status = updates.status;
    if (updates.note !== undefined) items[idx].note = updates.note;
    if (updates.buy_if !== undefined) items[idx].buy_if = updates.buy_if;
    if (updates.revisit_by !== undefined) items[idx].revisit_by = updates.revisit_by;
    if (updates.target_size_pct !== undefined) items[idx].target_size_pct = updates.target_size_pct;
    if (updates.tags !== undefined) items[idx].tags = updates.tags;

    saveWatchlist(items);
    return NextResponse.json({ ok: true, item: items[idx] });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** POST: add a new watchlist item. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, note, buy_if, revisit_by, target_size_pct, tags, status } = body as {
      ticker: string;
      note?: string;
      buy_if?: string;
      revisit_by?: string;
      target_size_pct?: number;
      tags?: string[];
      status?: WatchlistStatus;
    };

    if (!ticker) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 });
    }

    const items = loadWatchlist();
    if (items.some((w) => w.ticker === ticker)) {
      return NextResponse.json({ error: `${ticker} already on watchlist` }, { status: 409 });
    }

    const newItem = {
      ticker: ticker.toUpperCase(),
      added: new Date().toISOString().slice(0, 10),
      status: (status ?? "watch") as WatchlistStatus,
      note: note ?? "",
      buy_if: buy_if ?? null,
      revisit_by: revisit_by ?? null,
      target_size_pct: target_size_pct ?? null,
      tags: tags ?? [],
    };

    items.unshift(newItem);
    saveWatchlist(items);
    return NextResponse.json({ ok: true, item: newItem }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** DELETE: remove a ticker from watchlist. */
export async function DELETE(req: NextRequest) {
  try {
    const { ticker } = await req.json();
    if (!ticker) {
      return NextResponse.json({ error: "ticker is required" }, { status: 400 });
    }
    const items = loadWatchlist();
    const filtered = items.filter((w) => w.ticker !== ticker);
    if (filtered.length === items.length) {
      return NextResponse.json({ error: `${ticker} not in watchlist` }, { status: 404 });
    }
    saveWatchlist(filtered);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
