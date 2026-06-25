"use client";
import { useEffect, useState, useCallback } from "react";

type WatchlistStatus = "watch" | "consider" | "queue" | "declined";

interface WatchlistItem {
  ticker: string;
  added: string;
  status: WatchlistStatus;
  note: string;
  buy_if: string | null;
  revisit_by: string | null;
  target_size_pct: number | null;
  tags: string[];
}

const STATUS_ORDER: WatchlistStatus[] = ["watch", "consider", "queue", "declined"];

const STATUS_STYLE: Record<WatchlistStatus, { label: string; bg: string; text: string }> = {
  watch: { label: "WATCH", bg: "bg-[color:var(--bg-elev-2)]", text: "text-[color:var(--text-dim)]" },
  consider: { label: "CONSIDER", bg: "bg-[color:var(--accent-soft)]", text: "text-[color:var(--accent)]" },
  queue: { label: "QUEUE", bg: "bg-[color:var(--good-soft)]", text: "text-[color:var(--good)]" },
  declined: { label: "DECLINED", bg: "bg-[color:var(--bad-soft)]", text: "text-[color:var(--bad)]" },
};

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  // Handle ISO strings from yaml
  return d.slice(0, 10);
}

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // ticker being edited
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    fetch("/api/notes")
      .then((r) => r.json())
      .then((d) => setItems(d.watchlist ?? []))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (!items) return null;

  // Sort: queue first, then consider, then watch, then declined. Overdue items first within group.
  const sorted = [...items].sort((a, b) => {
    const rank: Record<string, number> = { queue: 0, consider: 1, watch: 2, declined: 3 };
    const ra = rank[a.status ?? "watch"] ?? 2;
    const rb = rank[b.status ?? "watch"] ?? 2;
    if (ra !== rb) return ra - rb;
    const aOverdue = isOverdue(a.revisit_by) ? 0 : 1;
    const bOverdue = isOverdue(b.revisit_by) ? 0 : 1;
    return aOverdue - bOverdue;
  });

  const overdueCount = items.filter((w) => isOverdue(w.revisit_by)).length;

  async function patchItem(ticker: string, updates: Partial<WatchlistItem>) {
    setSaving(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, ...updates }),
      });
      if (res.ok) reload();
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(ticker: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (res.ok) reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[color:var(--border)] px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Watchlist</h3>
            <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">
              {items.length} ticker{items.length === 1 ? "" : "s"} tracked
              {overdueCount > 0 && (
                <span className="ml-2 text-[color:var(--warn)]">{overdueCount} overdue</span>
              )}
            </p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="btn-ghost text-xs"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Add new ticker form */}
      {adding && (
        <AddForm
          onSave={() => { setAdding(false); reload(); }}
          onCancel={() => setAdding(false)}
        />
      )}

      <ul className="divide-y divide-[color:var(--border-muted)]">
        {sorted.map((w) => (
          <WatchlistRow
            key={w.ticker}
            item={w}
            isEditing={editing === w.ticker}
            saving={saving}
            onStartEdit={() => setEditing(w.ticker)}
            onStopEdit={() => setEditing(null)}
            onPatch={(updates) => patchItem(w.ticker, updates)}
            onDelete={() => deleteItem(w.ticker)}
          />
        ))}
      </ul>

      {items.length === 0 && !adding && (
        <p className="px-5 py-6 text-center text-xs text-[color:var(--text-faint)]">
          No watchlist items. Click + Add to start tracking a ticker.
        </p>
      )}
    </div>
  );
}

/* ─── Single row ─── */

function WatchlistRow({
  item: w,
  isEditing,
  saving,
  onStartEdit,
  onStopEdit,
  onPatch,
  onDelete,
}: {
  item: WatchlistItem;
  isEditing: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onPatch: (updates: Partial<WatchlistItem>) => void;
  onDelete: () => void;
}) {
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<WatchlistStatus | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const status = w.status ?? "watch";
  const style = STATUS_STYLE[status];
  const overdue = isOverdue(w.revisit_by);

  if (isEditing) {
    return (
      <EditRow
        item={w}
        saving={saving}
        onSave={(updates) => { onPatch(updates); onStopEdit(); }}
        onCancel={onStopEdit}
        onDelete={() => { onDelete(); onStopEdit(); }}
      />
    );
  }

  function handleStatusSelect(newStatus: WatchlistStatus) {
    setStatusMenuOpen(false);
    if (newStatus === "declined") {
      setPendingStatus("declined");
      setDeclineReason("");
    } else {
      onPatch({ status: newStatus });
    }
  }

  function submitDecline() {
    const reason = declineReason.trim();
    const updates: Partial<WatchlistItem> = { status: "declined" };
    if (reason) {
      updates.note = `DECLINED: ${reason}`;
    }
    onPatch(updates);
    setPendingStatus(null);
  }

  return (
    <li className={`group px-5 py-3 ${overdue ? "border-l-2 border-l-[color:var(--warn)]" : ""}`}>
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-white">{w.ticker}</span>
          {/* Status pill with dropdown */}
          <div className="relative">
            <button
              onClick={() => setStatusMenuOpen((v) => !v)}
              title="Click to change status"
              className={`cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-mono font-medium transition hover:brightness-125 ${style.bg} ${style.text}`}
            >
              {style.label} <span className="text-[8px] opacity-60">{"▾"}</span>
            </button>
            {statusMenuOpen && (
              <div
                className="absolute left-0 z-20 mt-1 w-28 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elev)] py-1 shadow-xl"
                onMouseLeave={() => setStatusMenuOpen(false)}
              >
                {STATUS_ORDER.map((s) => {
                  const st = STATUS_STYLE[s];
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusSelect(s)}
                      className={`block w-full px-3 py-1.5 text-left text-[10px] font-mono hover:bg-[color:var(--bg-hover)] ${
                        s === status ? st.text : "text-[color:var(--text-dim)]"
                      }`}
                    >
                      {st.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {w.revisit_by && (
            <span className={`text-[10px] ${overdue ? "font-medium text-[color:var(--warn)]" : "text-[color:var(--text-faint)]"}`}>
              {overdue
                ? `Overdue (${fmtDate(w.revisit_by)})`
                : `Review ${fmtDate(w.revisit_by)} (${daysUntil(w.revisit_by)}d)`
              }
            </span>
          )}
          <button
            onClick={onStartEdit}
            className="rounded px-1.5 py-0.5 text-[10px] text-[color:var(--text-faint)] opacity-0 transition hover:bg-[color:var(--bg-hover)] hover:text-white group-hover:opacity-100"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Inline decline reason prompt */}
      {pendingStatus === "declined" && (
        <div className="mt-2 rounded border border-[color:var(--bad)]/30 bg-[color:var(--bad-soft)] p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[color:var(--bad)]">
            Why are you declining {w.ticker}?
          </p>
          <textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            autoFocus
            rows={2}
            placeholder="Reason (replaces the current note)"
            className="mb-2 w-full rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-xs text-white placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent)] focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={submitDecline}
              className="rounded bg-[color:var(--bad)] px-3 py-1 text-[10px] font-medium text-white hover:brightness-110"
            >
              Decline
            </button>
            <button
              onClick={() => setPendingStatus(null)}
              className="text-[10px] text-[color:var(--text-faint)] hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="mt-1.5 text-xs text-[color:var(--text-dim)]">{w.note}</p>

      {w.buy_if && status !== "declined" && (
        <div className="mt-2 rounded border border-[color:var(--border-muted)] bg-[color:var(--bg-elev-2)] px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">Entry Signal</p>
          <p className="mt-0.5 text-xs text-[color:var(--text)]">{w.buy_if}</p>
        </div>
      )}

      {!w.buy_if && (status === "consider" || status === "queue") && (
        <p className="mt-2 text-[10px] text-[color:var(--warn)]">
          No entry criteria defined. Click Edit to add.
        </p>
      )}

      {w.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {w.tags.filter((t) => t !== "declined").map((t) => (
            <span key={t} className="chip">{t}</span>
          ))}
        </div>
      )}
    </li>
  );
}

/* ─── Edit row ─── */

function EditRow({
  item,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  item: WatchlistItem;
  saving: boolean;
  onSave: (updates: Partial<WatchlistItem>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [status, setStatus] = useState<WatchlistStatus>(item.status ?? "watch");
  const [note, setNote] = useState(item.note);
  const [buyIf, setBuyIf] = useState(item.buy_if ?? "");
  const [revisitBy, setRevisitBy] = useState(fmtDate(item.revisit_by));
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="border-l-2 border-l-[color:var(--accent)] bg-[color:var(--bg-elev-2)] px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-white">{item.ticker}</span>
        <span className="text-[10px] text-[color:var(--text-faint)]">Editing</span>
      </div>

      {/* Status selector */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">Status</label>
        <div className="flex gap-1">
          {STATUS_ORDER.filter((s) => s !== "declined").map((s) => {
            const st = STATUS_STYLE[s];
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded px-2.5 py-1 text-[10px] font-mono font-medium transition ${
                  status === s
                    ? `${st.bg} ${st.text} ring-1 ring-current`
                    : "bg-[color:var(--bg-elev)] text-[color:var(--text-faint)] hover:text-[color:var(--text-dim)]"
                }`}
              >
                {st.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Note */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">Note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-xs text-white placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent)] focus:outline-none"
        />
      </div>

      {/* Entry Signal */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
          Entry Signal (buy_if)
        </label>
        <textarea
          value={buyIf}
          onChange={(e) => setBuyIf(e.target.value)}
          rows={2}
          placeholder="When would you actually buy this? Be specific."
          className="w-full rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-xs text-white placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent)] focus:outline-none"
        />
      </div>

      {/* Revisit By */}
      <div className="mb-4">
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
          Revisit By
        </label>
        <input
          type="date"
          value={revisitBy}
          onChange={(e) => setRevisitBy(e.target.value)}
          className="rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-1.5 text-xs text-white focus:border-[color:var(--accent)] focus:outline-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() =>
              onSave({
                status,
                note,
                buy_if: buyIf.trim() || null,
                revisit_by: revisitBy || null,
              })
            }
            disabled={saving}
            className="rounded bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={onCancel}
            className="rounded bg-[color:var(--bg-elev)] px-3 py-1.5 text-xs text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)]"
          >
            Cancel
          </button>
        </div>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[color:var(--bad)]">Remove from watchlist?</span>
            <button
              onClick={onDelete}
              className="rounded bg-[color:var(--bad-soft)] px-2 py-1 text-[10px] font-medium text-[color:var(--bad)] hover:brightness-110"
            >
              Yes, Remove
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-[10px] text-[color:var(--text-faint)] hover:text-white"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-[10px] text-[color:var(--text-faint)] hover:text-[color:var(--bad)]"
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

/* ─── Add new ticker form ─── */

function AddForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [ticker, setTicker] = useState("");
  const [note, setNote] = useState("");
  const [buyIf, setBuyIf] = useState("");
  const [revisitBy, setRevisitBy] = useState("");
  const [status, setStatus] = useState<WatchlistStatus>("watch");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!ticker.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          status,
          note,
          buy_if: buyIf.trim() || undefined,
          revisit_by: revisitBy || undefined,
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
      <div className="mb-3 flex items-center gap-3">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="TICKER"
          autoFocus
          className="w-24 rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-1.5 font-mono text-sm font-semibold text-white placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent)] focus:outline-none"
        />
        <div className="flex gap-1">
          {STATUS_ORDER.filter((s) => s !== "declined").map((s) => {
            const st = STATUS_STYLE[s];
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded px-2 py-1 text-[10px] font-mono font-medium transition ${
                  status === s
                    ? `${st.bg} ${st.text} ring-1 ring-current`
                    : "bg-[color:var(--bg-elev)] text-[color:var(--text-faint)] hover:text-[color:var(--text-dim)]"
                }`}
              >
                {st.label}
              </button>
            );
          })}
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Why are you watching this?"
        className="mb-2 w-full rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-xs text-white placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent)] focus:outline-none"
      />

      <textarea
        value={buyIf}
        onChange={(e) => setBuyIf(e.target.value)}
        rows={1}
        placeholder="Entry signal: when would you buy? (optional)"
        className="mb-2 w-full rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-xs text-white placeholder:text-[color:var(--text-faint)] focus:border-[color:var(--accent)] focus:outline-none"
      />

      <div className="mb-3 flex items-center gap-2">
        <label className="text-[10px] text-[color:var(--text-faint)]">Revisit by:</label>
        <input
          type="date"
          value={revisitBy}
          onChange={(e) => setRevisitBy(e.target.value)}
          className="rounded border border-[color:var(--border)] bg-[color:var(--bg)] px-2 py-1 text-xs text-white focus:border-[color:var(--accent)] focus:outline-none"
        />
      </div>

      {error && <p className="mb-2 text-xs text-[color:var(--bad)]">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving || !ticker.trim()}
          className="rounded bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add to Watchlist"}
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
