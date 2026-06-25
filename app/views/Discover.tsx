"use client";
import type { PortfolioState } from "@/lib/portfolio";
import ErrorBoundary from "../components/ErrorBoundary";
import ThemeWinners from "../components/ThemeWinners";
import ThesisFit from "../components/ThesisFit";
import InsiderBuys from "../components/InsiderBuys";

export default function Discover({ state }: { state: PortfolioState }) {
  return (
    <div className="space-y-8">
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-white">Discover</h2>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--text-dim)]">
          Outside-your-portfolio ideas and portfolio context. Robinhood doesn't know your thesis, so it can't do this.
        </p>
      </div>

      {/* Bucket A: Thesis-Fit Candidates (weekly Claude scan) */}
      <ErrorBoundary label="Thesis-Fit"><ThesisFit /></ErrorBoundary>

      {/* Bucket B: Theme Winners screener */}
      <ErrorBoundary label="Theme Winners"><ThemeWinners /></ErrorBoundary>

      {/* Bucket D: Insider Activity */}
      <ErrorBoundary label="Insider Buys"><InsiderBuys /></ErrorBoundary>
    </div>
  );
}
