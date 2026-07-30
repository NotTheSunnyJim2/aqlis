import { useState, type FormEvent } from "react";
import { calculatePurification, type PurificationResult } from "../lib/api.js";

export function PurificationCalculator({ symbol }: { symbol: string }) {
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<PurificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const dividendReceived = Number(amount);
    if (!Number.isFinite(dividendReceived) || dividendReceived < 0) {
      setError("Enter a valid, non-negative amount.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await calculatePurification(symbol, dividendReceived);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
        Purification calculator — {symbol}
      </h2>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Not zakat — see README. Estimates how much of a dividend to donate,
        based on {symbol}&apos;s current non-compliant income ratio.
      </p>

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="flex items-end gap-2"
      >
        <div className="flex-1">
          <label
            htmlFor="dividend-amount"
            className="mb-1 block text-sm text-slate-700 dark:text-slate-300"
          >
            Dividend received ($)
          </label>
          <input
            id="dividend-amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
            className="w-full rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {loading ? "Calculating…" : "Calculate"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {result && (
        <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Non-compliant income ratio</dt>
          <dd className="text-right text-slate-900 dark:text-slate-100">
            {result.nonCompliantIncomeRatio === null
              ? "Unknown"
              : `${(result.nonCompliantIncomeRatio * 100).toFixed(2)}%`}
          </dd>
          <dt className="text-slate-500 dark:text-slate-400">Amount to purify (donate)</dt>
          <dd className="text-right font-medium text-red-600 dark:text-red-400">
            {result.purificationAmount === null
              ? "Unknown"
              : `$${result.purificationAmount.toFixed(2)}`}
          </dd>
          <dt className="text-slate-500 dark:text-slate-400">You may keep</dt>
          <dd className="text-right font-medium text-emerald-600 dark:text-emerald-400">
            {result.netAmount === null ? "Unknown" : `$${result.netAmount.toFixed(2)}`}
          </dd>
        </dl>
      )}
    </div>
  );
}
