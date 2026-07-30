import { useState } from "react";
import { StockList } from "./components/StockList.js";
import { RatioBreakdown } from "./components/RatioBreakdown.js";
import { DriftAlertFeed } from "./components/DriftAlertFeed.js";
import { PurificationCalculator } from "./components/PurificationCalculator.js";
import { PortfolioComparison } from "./components/PortfolioComparison.js";

function App() {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 dark:bg-slate-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-3xl font-semibold text-slate-900 dark:text-slate-100">
          Aqlis
        </h1>
        <StockList selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} />
        {selectedSymbol && (
          <div className="mt-6 space-y-6">
            <RatioBreakdown key={`ratio-${selectedSymbol}`} symbol={selectedSymbol} />
            <PurificationCalculator key={`purify-${selectedSymbol}`} symbol={selectedSymbol} />
          </div>
        )}
        <div className="mt-6">
          <DriftAlertFeed />
        </div>
        <div className="mt-6">
          <PortfolioComparison />
        </div>
      </div>
    </main>
  );
}

export default App;
