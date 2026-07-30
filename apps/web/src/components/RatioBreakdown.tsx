import { useEffect, useState } from "react";
import { fetchVerdict, type VerdictDetail } from "../lib/api.js";
import { describeReason } from "../lib/reasons.js";
import { ComplianceBadge } from "./ComplianceBadge.js";

interface RatioRowProps {
  label: string;
  value: number | null;
  /** Fraction (0.33 = 33%), matching the screening engine's thresholds. */
  threshold: number;
}

function RatioRow({ label, value, threshold }: RatioRowProps) {
  if (value === null) {
    return (
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
        <span className="text-sm text-slate-400 dark:text-slate-500">Unknown</span>
      </div>
    );
  }

  const pass = value < threshold;
  const barFillPercent = Math.min((value / threshold) * 100, 100);

  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
        <span
          className={`text-sm font-medium ${pass ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
        >
          {(value * 100).toFixed(2)}%{" "}
          <span className="text-slate-400 dark:text-slate-500">
            / {(threshold * 100).toFixed(0)}% threshold
          </span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full ${pass ? "bg-emerald-500" : "bg-red-500"}`}
          style={{ width: `${barFillPercent}%` }}
        />
      </div>
    </div>
  );
}

export function RatioBreakdown({ symbol }: { symbol: string }) {
  const [detail, setDetail] = useState<VerdictDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No reset of `detail`/`error` here: this component is remounted
    // fresh (via `key={symbol}` where it's rendered — see App.tsx)
    // whenever `symbol` changes, so useState already starts clean.
    // Resetting state synchronously inside the effect body itself is
    // the anti-pattern react-hooks/set-state-in-effect exists to catch.
    fetchVerdict(symbol)
      .then(setDetail)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [symbol]);

  if (error) {
    return (
      <p role="alert" className="text-red-600 dark:text-red-400">
        Failed to load verdict: {error}
      </p>
    );
  }

  if (detail === undefined) {
    return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  }

  if (detail === null || detail.computedAt === null) {
    return (
      <p className="text-slate-500 dark:text-slate-400">
        No verdict has been computed for {symbol} yet.
      </p>
    );
  }

  return (
    <div
      data-testid="ratio-breakdown"
      className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{symbol}</h2>
        <ComplianceBadge status={detail.status} />
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-slate-500 dark:text-slate-400">Business activity</dt>
        <dd className="text-right text-slate-900 dark:text-slate-100">
          {detail.businessActivityPass === null
            ? "Unknown"
            : detail.businessActivityPass
              ? "Passes"
              : "Excluded"}
        </dd>
        <dt className="text-slate-500 dark:text-slate-400">Market cap</dt>
        <dd className="text-right text-slate-900 dark:text-slate-100">
          {detail.marketCap ? `$${Number(detail.marketCap).toLocaleString()}` : "—"}
        </dd>
      </dl>

      <RatioRow label="Debt ratio" value={detail.debtRatio} threshold={0.33} />
      <RatioRow label="Cash & interest-bearing securities" value={detail.cashRatio} threshold={0.33} />
      <RatioRow label="Receivables ratio" value={detail.receivablesRatio} threshold={0.33} />
      <RatioRow
        label="Non-compliant income"
        value={detail.nonCompliantIncomeRatio}
        threshold={0.05}
      />

      {detail.reasons.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
          <h3 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Reasons
          </h3>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-600 dark:text-slate-400">
            {detail.reasons.map((reason) => (
              <li key={reason}>{describeReason(reason)}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Last checked: {new Date(detail.computedAt).toLocaleString()}
      </p>
    </div>
  );
}
