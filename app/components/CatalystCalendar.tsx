"use client";
import { useEffect, useState } from "react";

interface Event {
  date: string;
  ticker: string | null;
  name: string;
  type: "earnings" | "corporate" | "industry" | "macro";
  impact: "high" | "medium" | "low";
  notes: string;
  days_away: number;
}

interface Data { events: Event[]; horizon_days: number; today: string }

const IMPACT_STYLE: Record<Event["impact"], { bar: string; label: string }> = {
  high:   { bar: "bg-[color:var(--bad)]",  label: "text-[color:var(--bad)]" },
  medium: { bar: "bg-[color:var(--warn)]", label: "text-[color:var(--warn)]" },
  low:    { bar: "bg-[color:var(--text-faint)]", label: "text-[color:var(--text-faint)]" },
};

const TYPE_STYLE: Record<Event["type"], string> = {
  earnings: "text-[color:var(--accent)]",
  corporate: "text-[color:var(--good)]",
  industry: "text-[color:var(--text)]",
  macro: "text-[color:var(--text-dim)]",
};

const HORIZONS = [
  { days: 14, label: "2W" },
  { days: 30, label: "1M" },
  { days: 60, label: "2M" },
  { days: 90, label: "3M" },
];

export default function CatalystCalendar({ maxHeight }: { maxHeight?: boolean } = {}) {
  const [data, setData] = useState<Data | null>(null);
  const [days, setDays] = useState(60);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/catalysts?days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .finally(() => setLoading(false));
  }, [days]);

  // Group by week-bucket
  const groupKey = (e: Event) => {
    if (e.days_away <= 7) return "This Week";
    if (e.days_away <= 14) return "Next Week";
    if (e.days_away <= 30) return "2-4 Weeks";
    return "Later";
  };

  const grouped = new Map<string, Event[]>();
  for (const e of data?.events ?? []) {
    const k = groupKey(e);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(e);
  }
  const groupOrder = ["This Week", "Next Week", "2-4 Weeks", "Later"];

  return (
    <div className={`card overflow-hidden ${maxHeight ? "flex flex-col h-full" : ""}`}>
      <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-4 flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-white">Calendar</h3>
          <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">
            Earnings, macro releases (FOMC / CPI / jobs / PCE), position-specific catalysts
          </p>
        </div>
        <div className="flex gap-0.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elev-2)] p-0.5">
          {HORIZONS.map((h) => (
            <button
              key={h.days}
              onClick={() => setDays(h.days)}
              data-active={days === h.days}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[color:var(--text-dim)] transition hover:text-white data-[active=true]:bg-[color:var(--bg-hover)] data-[active=true]:text-white"
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && (
        <div className="p-5 text-xs text-[color:var(--text-faint)]">Loading...</div>
      )}

      {data && data.events.length === 0 && (
        <p className="p-5 text-sm text-[color:var(--text-dim)]">No catalysts in the next {days} days.</p>
      )}

      {data && data.events.length > 0 && (
        <div className={maxHeight ? "flex-1 overflow-y-auto" : ""}>
          {groupOrder.map((g) => {
            const evs = grouped.get(g);
            if (!evs || evs.length === 0) return null;
            return (
              <div key={g}>
                <div className="border-b border-t border-[color:var(--border-muted)] bg-[color:var(--bg-elev-2)] px-5 py-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--text-faint)]">{g}</p>
                </div>
                <ul className="divide-y divide-[color:var(--border-muted)]">
                  {evs.map((e, i) => {
                    const im = IMPACT_STYLE[e.impact];
                    return (
                      <li key={i} className="flex items-start gap-3 px-5 py-2.5">
                        <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${im.bar}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="num font-mono text-[11px] text-[color:var(--text-dim)]">{e.date}</span>
                            <span className="text-[10px] text-[color:var(--text-faint)]">+{e.days_away}d</span>
                            <span className={`text-[10px] uppercase tracking-wider ${TYPE_STYLE[e.type]}`}>{e.type}</span>
                            {e.ticker && (
                              <span className="font-mono text-xs font-semibold text-white">{e.ticker}</span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-[color:var(--text)]">{e.name}</p>
                          {e.notes && (
                            <p className="mt-0.5 text-[10px] italic text-[color:var(--text-faint)]">{e.notes}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
