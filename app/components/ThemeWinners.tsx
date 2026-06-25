"use client";
import { useEffect, useState } from "react";

type Window = "1d" | "5d" | "1mo" | "3mo" | "1y" | "ytd";

const WINDOWS: { key: Window; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "5d", label: "1W" },
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1Y" },
];

interface Row {
  ticker: string;
  held: boolean;
  price: number | null;
  return_pct: number | null;
  pct_off_high: number | null;
  near_52w_high: boolean;
}

interface ThemeBlock {
  key: string;
  label: string;
  description: string;
  rows: Row[];
}

export default function ThemeWinners() {
  const [win, setWin] = useState<Window>("1mo");
  const [themes, setThemes] = useState<ThemeBlock[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/discover/winners?window=${win}`)
      .then((r) => r.json())
      .then((d) => setThemes(d.themes ?? []))
      .catch(() => setThemes([]))
      .finally(() => setLoading(false));
  }, [win]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Theme Winners</h3>
          <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">
            Top performers in your themes. Names you hold are highlighted, others are candidates.
          </p>
        </div>
        <div className="flex gap-0.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elev-2)] p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWin(w.key)}
              data-active={win === w.key}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[color:var(--text-dim)] transition hover:text-white data-[active=true]:bg-[color:var(--bg-hover)] data-[active=true]:text-white"
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-px bg-[color:var(--border-muted)] md:grid-cols-2">
        {loading && !themes && (
          <div className="col-span-2 bg-[color:var(--bg-elev)] p-6 text-xs text-[color:var(--text-faint)]">Loading screener…</div>
        )}
        {themes?.map((t) => (
          <div key={t.key} className="bg-[color:var(--bg-elev)] p-5">
            <div className="mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text)]">{t.label}</h4>
              <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">{t.description}</p>
            </div>
            <ul className="space-y-2">
              {t.rows.length === 0 && (
                <li className="text-[11px] text-[color:var(--text-faint)]">No data.</li>
              )}
              {t.rows.map((r) => {
                const positive = (r.return_pct ?? 0) >= 0;
                return (
                  <li key={r.ticker} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-sm font-semibold ${r.held ? "text-[color:var(--accent)]" : "text-white"}`}>
                        {r.ticker}
                      </span>
                      {r.held && <span className="chip text-[color:var(--accent)]" style={{ background: "var(--accent-soft)" }}>HELD</span>}
                      {r.near_52w_high && <span className="chip text-[color:var(--good)]" style={{ background: "var(--good-soft)" }}>52w hi</span>}
                    </div>
                    <div className="flex items-center gap-3 num">
                      <span className="font-mono text-[color:var(--text-dim)]">
                        {r.price !== null ? `$${r.price.toFixed(2)}` : "-"}
                      </span>
                      <span className={`font-medium ${positive ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
                        {r.return_pct !== null
                          ? `${positive ? "+" : ""}${r.return_pct.toFixed(1)}%`
                          : "-"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
