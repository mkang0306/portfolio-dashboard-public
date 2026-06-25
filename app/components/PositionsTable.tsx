"use client";
import { useState, useMemo } from "react";
import type { Position } from "@/lib/portfolio";
import { categoryFor } from "@/lib/categories";

type SortKey =
  | "value" | "day_pct" | "day_usd" | "weight" | "drift"
  | "ticker" | "account" | "category" | "pl_pct" | "pl_usd"
  | "shares" | "price";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "value", label: "Value" },
  { key: "weight", label: "Weight" },
  { key: "day_pct", label: "Day %" },
  { key: "day_usd", label: "Day $" },
  { key: "pl_pct", label: "Total return %" },
  { key: "pl_usd", label: "Total return $" },
  { key: "drift", label: "Drift" },
  { key: "ticker", label: "Ticker A–Z" },
  { key: "account", label: "Account" },
  { key: "category", label: "Category" },
  { key: "shares", label: "Shares" },
  { key: "price", label: "Price" },
];

const fmtUSD = (n: number, frac = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: frac, maximumFractionDigits: frac });
const fmtPct = (n: number | null, frac = 2) =>
  n === null ? "-" : `${n > 0 ? "+" : ""}${n.toFixed(frac)}%`;

function sortKey(p: Position, k: SortKey): number | string {
  const cat = categoryFor(p, "role").label;
  switch (k) {
    case "value": return p.value;
    case "weight": return p.weight_pct;
    case "day_pct": return p.day_change_pct ?? -Infinity;
    case "day_usd": return p.day_change_pct !== null ? (p.value * p.day_change_pct) / (100 + p.day_change_pct) : -Infinity;
    case "pl_pct": return p.unrealized_pl_pct ?? -Infinity;
    case "pl_usd": return p.unrealized_pl ?? -Infinity;
    case "drift": return p.drift_pct;
    case "ticker": return p.ticker;
    case "account": return p.account;
    case "category": return cat;
    case "shares": return p.shares;
    case "price": return p.price ?? 0;
  }
}

export default function PositionsTable({
  positions,
  onResearch,
}: {
  positions: Position[];
  onResearch: (ticker: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>("value");
  const [desc, setDesc] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasCostBasis = positions.some((p) => p.cost_basis !== null);

  const sorted = useMemo(() => {
    const out = [...positions].sort((a, b) => {
      const av = sortKey(a, sort);
      const bv = sortKey(b, sort);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv);
      return (av as number) - (bv as number);
    });
    return desc ? out.reverse() : out;
  }, [positions, sort, desc]);

  const activeLabel = SORT_OPTIONS.find((s) => s.key === sort)?.label ?? "Value";

  const handleHeaderClick = (k: SortKey) => {
    if (sort === k) setDesc((d) => !d);
    else { setSort(k); setDesc(true); }
  };

  return (
    <div className="card-flush">
      <div className="flex items-center justify-between border-b border-[color:var(--border)] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Positions</h2>
          <p className="text-[11px] text-[color:var(--text-faint)]">{positions.length} holdings · sorted by {activeLabel.toLowerCase()} {desc ? "↓" : "↑"}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((m) => !m)}
              className="btn-ghost flex items-center gap-1.5"
            >
              Sort: {activeLabel}
              <span className="text-[color:var(--text-faint)]">▾</span>
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg-elev)] py-1 shadow-xl"
                onMouseLeave={() => setMenuOpen(false)}
              >
                {SORT_OPTIONS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => { setSort(s.key); setMenuOpen(false); }}
                    data-active={sort === s.key}
                    className="block w-full px-3 py-1.5 text-left text-xs text-[color:var(--text-dim)] hover:bg-[color:var(--bg-hover)] hover:text-white data-[active=true]:text-[color:var(--accent)]"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setDesc((d) => !d)}
            className="btn-ghost"
            title={desc ? "Descending: click to reverse" : "Ascending: click to reverse"}
          >
            {desc ? "↓" : "↑"}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border)] text-[10px] uppercase tracking-wider text-[color:var(--text-faint)]">
              <Th onClick={() => handleHeaderClick("ticker")} active={sort === "ticker"}>Ticker</Th>
              <Th align="right" onClick={() => handleHeaderClick("shares")} active={sort === "shares"}>Shares</Th>
              <Th align="right" onClick={() => handleHeaderClick("price")} active={sort === "price"}>Price</Th>
              <Th align="right" onClick={() => handleHeaderClick("day_pct")} active={sort === "day_pct"}>Day</Th>
              <Th align="right" onClick={() => handleHeaderClick("value")} active={sort === "value"}>Value</Th>
              {hasCostBasis && (
                <Th align="right" onClick={() => handleHeaderClick("pl_usd")} active={sort === "pl_usd" || sort === "pl_pct"}>Return</Th>
              )}
              <Th align="right" onClick={() => handleHeaderClick("weight")} active={sort === "weight"}>Weight</Th>
              <Th align="right" onClick={() => handleHeaderClick("drift")} active={sort === "drift"}>Drift</Th>
              <Th onClick={() => handleHeaderClick("account")} active={sort === "account"}>Acct</Th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const dayUSD = p.day_change_pct !== null ? (p.value * p.day_change_pct) / (100 + p.day_change_pct) : null;
              return (
                <tr
                  key={p.ticker}
                  className={`group border-b border-[color:var(--border-muted)] transition hover:bg-[color:var(--bg-hover)] ${i === sorted.length - 1 ? "border-b-0" : ""}`}
                >
                  <td className="px-5 py-3.5">
                    <p className="font-mono text-sm font-semibold tracking-tight text-white">{p.ticker}</p>
                    <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-[color:var(--text-faint)]">{p.name}</p>
                  </td>
                  <td className="num px-3 py-3.5 text-right text-[color:var(--text-dim)]">{p.shares}</td>
                  <td className="num px-3 py-3.5 text-right text-white">
                    {p.price === null ? "-" : `$${p.price.toFixed(2)}`}
                  </td>
                  <td className={`num px-3 py-3.5 text-right ${(p.day_change_pct ?? 0) >= 0 ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}`}>
                    {fmtPct(p.day_change_pct)}
                  </td>
                  <td className="num px-3 py-3.5 text-right font-medium text-white">{fmtUSD(p.value)}</td>
                  {hasCostBasis && (
                    <td className="num px-3 py-3.5 text-right">
                      {p.unrealized_pl !== null ? (
                        <div>
                          <p className={p.unrealized_pl >= 0 ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"}>
                            {p.unrealized_pl >= 0 ? "+" : "−"}{fmtUSD(Math.abs(p.unrealized_pl))}
                          </p>
                          <p className="text-[11px] text-[color:var(--text-faint)]">
                            {fmtPct(p.unrealized_pl_pct, 1)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[color:var(--text-faint)]">-</span>
                      )}
                    </td>
                  )}
                  <td className="num px-3 py-3.5 text-right text-[color:var(--text-dim)]">{p.weight_pct.toFixed(1)}%</td>
                  <td className={`num px-3 py-3.5 text-right ${Math.abs(p.drift_pct) >= 5 ? "text-[color:var(--warn)]" : Math.abs(p.drift_pct) >= 2 ? "text-[color:var(--text)]" : "text-[color:var(--text-faint)]"}`}>
                    {fmtPct(p.drift_pct, 1)}
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="chip">{p.account}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => onResearch(p.ticker)}
                      className="rounded-md border border-[color:var(--border)] px-3 py-1 text-xs font-medium text-[color:var(--text-dim)] opacity-0 transition group-hover:opacity-100 hover:border-[color:var(--accent)] hover:text-white"
                    >
                      Research
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align, onClick, active }: { children: React.ReactNode; align?: "right"; onClick?: () => void; active?: boolean }) {
  return (
    <th className={`px-3 py-3 first:pl-5 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={onClick}
        className={`font-medium uppercase tracking-wider transition hover:text-white ${active ? "text-[color:var(--accent)]" : ""}`}
      >
        {children}
      </button>
    </th>
  );
}
