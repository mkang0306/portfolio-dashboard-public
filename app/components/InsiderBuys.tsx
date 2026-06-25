"use client";
import { useEffect, useState } from "react";

interface Row {
  ticker: string;
  insider: string;
  position: string;
  transaction: string;
  date: string;
  shares: number | null;
  value: number | null;
  ownership: string;
}

const fmtUSD = (n: number | null) =>
  n === null ? "-" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function InsiderBuys() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/discover/insiders")
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[color:var(--border)] px-5 py-4">
        <h3 className="text-sm font-semibold text-white">Insider Activity (Your Stocks, Last 90 Days)</h3>
        <p className="mt-0.5 text-[11px] text-[color:var(--text-faint)]">
          Officers/directors buys/grants only. Sells filtered out as noise.
        </p>
      </div>
      {loading ? (
        <p className="p-5 text-xs text-[color:var(--text-faint)]">Loading…</p>
      ) : !rows || rows.length === 0 ? (
        <p className="p-5 text-xs text-[color:var(--text-dim)]">
          No notable insider activity reported in the last 90 days for your individual stocks.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--border-muted)]">
          {rows.map((r, i) => (
            <li key={i} className="px-5 py-3 text-xs">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="font-mono font-semibold text-white">{r.ticker}</span>
                  <span className="ml-2 text-[color:var(--text)]">{r.insider}</span>
                  <span className="ml-2 text-[color:var(--text-faint)]">{r.position}</span>
                </div>
                <div className="num text-right">
                  <span className="font-medium text-[color:var(--good)]">{fmtUSD(r.value)}</span>
                  {r.shares !== null && <span className="ml-2 text-[color:var(--text-faint)]">({r.shares.toLocaleString()} sh)</span>}
                </div>
              </div>
              <p className="mt-0.5 text-[color:var(--text-faint)]">{r.transaction} · {r.date}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
