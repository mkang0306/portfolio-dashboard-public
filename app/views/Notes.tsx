"use client";
import { useEffect, useState, useCallback } from "react";

interface JournalEntry { date: string; ticker: string | null; tags: string[]; body: string }
interface ClosedPosition {
  ticker: string;
  buys: { date: string; shares: number; price: number; amount: number }[];
  sells: { date: string; shares: number; price: number; amount: number }[];
  net_realized: number;
  last_activity: string;
}
interface Data { journal: JournalEntry[]; closed_positions: ClosedPosition[] }

const fmtUSD = (n: number) => `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function Notes() {
  const [data, setData] = useState<Data | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(() => {
    fetch("/api/notes").then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (!data) return <div className="card p-6 text-sm text-[color:var(--text-faint)]">Loading notes...</div>;

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-white">Notes & Journal</h2>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--text-dim)]">
          Decision history and tracking.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Closed Positions */}
        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Closed Positions ({new Date().getFullYear()})</h3>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">Positions you exited this calendar year from the transaction history</p>
          </div>
          {data.closed_positions.length === 0 ? (
            <p className="p-5 text-xs text-[color:var(--text-faint)]">No closed positions in the current transaction window.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--border-muted)]">
              {data.closed_positions.map((c) => {
                const totalSold = c.sells.reduce((s, x) => s + x.shares, 0);
                const totalBought = c.buys.reduce((s, x) => s + x.shares, 0);
                const wasOpenedInWindow = c.buys.length > 0;
                return (
                  <li key={c.ticker} className="px-5 py-3 text-xs">
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-sm font-semibold text-white">{c.ticker}</span>
                      <span className="num text-[color:var(--text-faint)]">last activity {c.last_activity}</span>
                    </div>
                    <p className="mt-1 text-[color:var(--text-dim)]">
                      {wasOpenedInWindow && (
                        <span>Opened {totalBought} sh, </span>
                      )}
                      <span>Sold {totalSold} sh, </span>
                      <span className="num text-[color:var(--good)]">realized {fmtUSD(c.net_realized)}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Decision Journal */}
        <div className="card overflow-hidden">
          <div className="border-b border-[color:var(--border)] px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Decision Journal</h3>
                <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">Newest entries first</p>
              </div>
              <button
                onClick={() => setAdding(true)}
                className="btn-ghost text-xs"
              >
                + Entry
              </button>
            </div>
          </div>

          {/* Add journal entry form */}
          {adding && (
            <JournalAddForm
              onSave={() => { setAdding(false); reload(); }}
              onCancel={() => setAdding(false)}
            />
          )}

          {data.journal.length === 0 && !adding ? (
            <p className="p-5 text-xs text-[color:var(--text-faint)]">No entries. Click + Entry to start.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--border-muted)]">
              {data.journal.map((e, i) => (
                <li key={i} className="px-5 py-4">
                  <div className="mb-2 flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-xs text-[color:var(--text-dim)]">{typeof e.date === "string" ? e.date.slice(0, 10) : e.date}</span>
                    {e.ticker && <span className="font-mono text-sm font-semibold text-white">{e.ticker}</span>}
                    {e.tags.map((t) => (
                      <span key={t} className="chip">{t}</span>
                    ))}
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[color:var(--text)]">{e.body}</pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Journal add form ─── */

function JournalAddForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [ticker, setTicker] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const tags = tagsStr
        .split(",")
        .map((t) => t.trim().toLowerCase().replace(/\s+/g, "_"))
        .filter(Boolean);
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase() || undefined,
          tags,
          body: body.trim(),
        }),
      });
      if (res.ok) {
        onSave();
      } else {
        const d = await res.json();
        setError(d.error ?? "Failed to add");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-[color:var(--border)] bg-[color:var(--bg-elev-2)] px-5 py-4">
      <div className="mb-2 flex gap-3">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="TICKER (optional)"
          className="w-32 rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-1.5 font-mono text-xs text-white placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent)] focus:outline-none"
        />
        <input
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          placeholder="Tags (comma-separated)"
          className="flex-1 rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-1.5 text-xs text-white placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent)] focus:outline-none"
        />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        autoFocus
        placeholder="What did you decide and why?"
        className="mb-3 w-full rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-xs text-white placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent)] focus:outline-none"
      />
      {error && <p className="mb-2 text-xs text-[color:var(--bad)]">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving || !body.trim()}
          className="rounded bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add Entry"}
        </button>
        <button
          onClick={onCancel}
          className="rounded bg-[color:var(--bg-elev)] px-3 py-1.5 text-xs text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
