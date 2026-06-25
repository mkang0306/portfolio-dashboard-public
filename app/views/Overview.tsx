"use client";
import type { PortfolioState } from "@/lib/portfolio";
import PositionsTable from "../components/PositionsTable";
import MacroSignals from "../components/MacroSignals";
import CatalystCalendar from "../components/CatalystCalendar";
import Watchlist from "../components/Watchlist";
import ErrorBoundary from "../components/ErrorBoundary";
import TimeSeriesChart from "../components/TimeSeriesChart";

export default function Overview({
  state,
  onResearch,
}: {
  state: PortfolioState;
  onResearch: (ticker: string) => void;
}) {
  return (
    <div className="space-y-6">
      <TimeSeriesChart />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <PositionsTable positions={state.positions} onResearch={onResearch} />
          <ErrorBoundary label="Watchlist"><Watchlist /></ErrorBoundary>
        </div>
        <aside className="flex flex-col gap-4">
          <ErrorBoundary label="Macro Signals"><MacroSignals /></ErrorBoundary>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ErrorBoundary label="Calendar"><CatalystCalendar maxHeight /></ErrorBoundary>
          </div>
        </aside>
      </div>
    </div>
  );
}
