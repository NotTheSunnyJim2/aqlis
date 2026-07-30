import { useEffect, useState } from "react";
import { fetchCompanies, type CompanySummary } from "../lib/api.js";
import { ComplianceBadge } from "./ComplianceBadge.js";

interface StockListProps {
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}

export function StockList({ selectedSymbol, onSelect }: StockListProps) {
  const [companies, setCompanies] = useState<CompanySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCompanies()
      .then(setCompanies)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-red-600 dark:text-red-400">
        Failed to load companies: {error}
      </p>
    );
  }

  if (companies === null) {
    return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  }

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-slate-200 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <th className="py-2 pr-4 font-medium">Symbol</th>
          <th className="py-2 pr-4 font-medium">Name</th>
          <th className="py-2 pr-4 font-medium">Price</th>
          <th className="py-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {companies.map((company) => (
          <tr
            key={company.symbol}
            data-testid={`stock-row-${company.symbol}`}
            onClick={() => {
              onSelect(company.symbol);
            }}
            aria-selected={company.symbol === selectedSymbol}
            className={`cursor-pointer border-b border-slate-100 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800 ${
              company.symbol === selectedSymbol ? "bg-slate-100 dark:bg-slate-800" : ""
            }`}
          >
            <td className="py-2 pr-4 font-mono font-medium text-slate-900 dark:text-slate-100">
              {company.symbol}
            </td>
            <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{company.name}</td>
            <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">
              {company.latestPrice ? `$${company.latestPrice}` : "—"}
            </td>
            <td className="py-2">
              <ComplianceBadge status={company.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
