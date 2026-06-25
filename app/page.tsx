"use client";
import { useEffect, useState } from "react";
import type { PortfolioState } from "@/lib/portfolio";
import Overview from "./views/Overview";
import Discover from "./views/Discover";
import Analysis from "./views/Analysis";
import Income from "./views/Income";
import Notes from "./views/Notes";
import ResearchPanel from "./components/ResearchPanel";

type TabKey = "overview" | "discover" | "analysis" | "income" | "notes";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "discover", label: "Discover" },
  { key: "analysis", label: "Analysis" },
  { key: "income", label: "Income" },
  { key: "notes", label: "Notes" },
];

const fmtUSD = (n: number, frac = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: frac, maximumFractionDigits: frac });

const fmtPct = (n: number | null, frac = 2) =>
  n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(frac)}%`;

export default function Page() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [state, setState] = useState<PortfolioState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [researchTicker, setResearchTicker] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/prices")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else { setState(d); setError(null); setLastLoadedAt(new Date()); }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const dayPct = state?.day_change_pct ?? null;
  const dayUSD = state && dayPct !== null
    ? (state.total_value * dayPct) / (100 + dayPct)
    : null;
  const positiveDay = (dayPct ?? 0) >= 0;

  return (
    <>
      {/* Sticky header */}
      <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--bg)]/85 backdrop-blur-md">
        <div className="mx-auto max-w-[1400px] px-8 pt-8 pb-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--text-faint)]">
                Portfolio · {lastLoadedAt ? lastLoadedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
              </p>
              <div className="mt-3 flex items-baseline gap-5">
                <h1 className="num text-[44px] font-semibold tracking-tight text-white">
                  {state ? fmtUSD(state.total_value) : "—"}
                </h1>
                {state && dayPct !== null && (
                  <span className={`num text-lg font-medium ${positiveDay ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
                    {dayUSD !== null ? (positiveDay ? "+" : "−") + fmtUSD(Math.abs(dayUSD)) : "—"}
                    <span className="ml-2 text-[color:var(--text-dim)]">({fmtPct(dayPct)})</span>
                  </span>
                )}
              </div>
              {state && (
                <p className="mt-2 flex items-center gap-4 text-xs text-[color:var(--text-dim)]">
                  <span><span className="text-[color:var(--text-faint)]">Taxable</span> <span className="num text-[color:var(--text)]">{fmtUSD(state.by_account.taxable ?? 0, 0)}</span></span>
                  <span className="text-[color:var(--text-faint)]">·</span>
                  <span><span className="text-[color:var(--text-faint)]">Roth IRA</span> <span className="num text-[color:var(--text)]">{fmtUSD(state.by_account.roth ?? 0, 0)}</span></span>
                </p>
              )}
            </div>
            <button onClick={load} disabled={loading} className="btn-ghost">
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <nav className="-mb-px mt-6 flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                data-active={tab === t.key}
                className="tab-btn"
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-8 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-[color:var(--bad)]/40 bg-[color:var(--bad-soft)] p-4 text-sm text-[color:var(--bad)]">
            {error}
          </div>
        )}

        {!state && loading && (
          <p className="text-sm text-[color:var(--text-dim)]">Loading positions…</p>
        )}

        {state && tab === "overview" && (
          <Overview state={state} onResearch={setResearchTicker} />
        )}
        {state && tab === "discover" && <Discover state={state} />}
        {state && tab === "analysis" && <Analysis state={state} />}
        {state && tab === "income" && <Income state={state} />}
        {state && tab === "notes" && <Notes />}
      </main>

      {researchTicker && (
        <ResearchPanel ticker={researchTicker} onClose={() => setResearchTicker(null)} />
      )}
    </>
  );
}
