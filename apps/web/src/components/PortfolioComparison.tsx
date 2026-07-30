import { useEffect, useState, type MouseEvent } from "react";
import { fetchPortfolioComparison, type PortfolioComparison as PortfolioComparisonData } from "../lib/api.js";

const WIDTH = 640;
const HEIGHT = 280;
const MARGIN = { top: 12, right: 16, bottom: 28, left: 44 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/** day 0 -> "Now", otherwise nearest whole month (252 trading days/year). */
function formatDay(day: number): string {
  if (day === 0) return "Now";
  const months = Math.round((day / 252) * 12);
  return months === 12 ? "1yr" : `${months}mo`;
}

interface PercentileDay {
  day: number;
  p5: number;
  p95: number;
  p50: number;
}

/**
 * Fan chart: a shaded 5th-95th percentile band plus a median line, per
 * portfolio, sharing one y-axis (never dual-axis — both series are the
 * same unit, portfolio value as a fraction of the starting amount).
 * Two series only, so a fixed categorical color pair (blue = halal,
 * conventional = orange, always in that order) is comfortable without a
 * legend box being optional — see docs/adr/005 for the simulation
 * itself; this component only renders what the backend already
 * computed.
 */
export function PortfolioComparison() {
  const [data, setData] = useState<PortfolioComparisonData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPortfolioComparison()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div
        data-testid="portfolio-comparison"
        className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
      >
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        data-testid="portfolio-comparison"
        className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
      >
        <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Halal vs conventional portfolio simulation
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Simulation warming up — check back shortly.
        </p>
      </div>
    );
  }

  const horizonDays = data.halal.percentilesByDay.length - 1;
  const allBandValues = [...data.halal.percentilesByDay, ...data.conventional.percentilesByDay].flatMap(
    (d) => [d.p5, d.p95],
  );
  const yMin = Math.min(...allBandValues);
  const yMax = Math.max(...allBandValues);
  const yPad = (yMax - yMin) * 0.05;
  const domainMin = yMin - yPad;
  const domainMax = yMax + yPad;

  function scaleX(day: number): number {
    return MARGIN.left + (day / horizonDays) * PLOT_WIDTH;
  }
  function scaleY(value: number): number {
    return MARGIN.top + PLOT_HEIGHT - ((value - domainMin) / (domainMax - domainMin)) * PLOT_HEIGHT;
  }

  function bandPath(points: PercentileDay[]): string {
    const top = points.map((p) => `${scaleX(p.day)},${scaleY(p.p95)}`).join(" L ");
    const bottom = points
      .slice()
      .reverse()
      .map((p) => `${scaleX(p.day)},${scaleY(p.p5)}`)
      .join(" L ");
    return `M ${top} L ${bottom} Z`;
  }

  function linePath(points: PercentileDay[]): string {
    return `M ${points.map((p) => `${scaleX(p.day)},${scaleY(p.p50)}`).join(" L ")}`;
  }

  const TICK_COUNT = 4;
  const yTicks = Array.from(
    { length: TICK_COUNT + 1 },
    (_, i) => domainMin + ((domainMax - domainMin) * i) / TICK_COUNT,
  );
  const xTicks = [0, 63, 126, 189, 252].filter((d) => d <= horizonDays);

  function handleMouseMove(event: MouseEvent<SVGRectElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / PLOT_WIDTH));
    setHoverDay(Math.round(fraction * horizonDays));
  }

  const halalAtHover = hoverDay !== null ? data.halal.percentilesByDay[hoverDay] : undefined;
  const conventionalAtHover = hoverDay !== null ? data.conventional.percentilesByDay[hoverDay] : undefined;

  return (
    <div
      data-testid="portfolio-comparison"
      className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"
    >
      <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
        Halal vs conventional portfolio simulation
      </h2>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        1-year Monte Carlo projection from each stock&apos;s real historical drift and
        volatility (see ADR-005). Halal = {data.halalSymbols.join(", ")}. Conventional = full
        watchlist. Shaded bands are the 5th–95th percentile range of simulated outcomes; lines
        are the median.
      </p>

      <div className="mb-2 flex gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600 dark:bg-blue-400" />
          Halal
        </span>
        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-600 dark:bg-orange-400" />
          Conventional
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Fan chart comparing simulated halal and conventional portfolio value over one year"
        className="w-full"
      >
        {yTicks.map((value) => (
          <g key={value}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={scaleY(value)}
              y2={scaleY(value)}
              className="stroke-slate-200 dark:stroke-slate-700"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 6}
              y={scaleY(value)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-slate-400 text-[9px] dark:fill-slate-500"
            >
              {formatPercent(value)}
            </text>
          </g>
        ))}

        {xTicks.map((day) => (
          <text
            key={day}
            x={scaleX(day)}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-slate-400 text-[9px] dark:fill-slate-500"
          >
            {formatDay(day)}
          </text>
        ))}

        {/* Conventional drawn first, halal on top — fixed order, matches the legend. */}
        <path d={bandPath(data.conventional.percentilesByDay)} className="fill-orange-500/15" />
        <path
          d={linePath(data.conventional.percentilesByDay)}
          className="stroke-orange-600 dark:stroke-orange-400"
          fill="none"
          strokeWidth={2}
        />

        <path d={bandPath(data.halal.percentilesByDay)} className="fill-blue-500/15" />
        <path
          d={linePath(data.halal.percentilesByDay)}
          className="stroke-blue-600 dark:stroke-blue-400"
          fill="none"
          strokeWidth={2}
        />

        {hoverDay !== null && (
          <line
            x1={scaleX(hoverDay)}
            x2={scaleX(hoverDay)}
            y1={MARGIN.top}
            y2={MARGIN.top + PLOT_HEIGHT}
            className="stroke-slate-400 dark:stroke-slate-500"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          fill="transparent"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverDay(null)}
        />
      </svg>

      {halalAtHover && conventionalAtHover && (
        <div
          data-testid="portfolio-comparison-hover"
          className="mt-1 flex justify-between text-xs text-slate-600 dark:text-slate-300"
        >
          <span>{formatDay(halalAtHover.day)}</span>
          <span>Halal median {formatPercent(halalAtHover.p50)}</span>
          <span>Conventional median {formatPercent(conventionalAtHover.p50)}</span>
        </div>
      )}

      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Final simulated portfolio value statistics after 1 year</caption>
        <thead>
          <tr className="text-left text-slate-500 dark:text-slate-400">
            <th scope="col" className="font-normal" />
            <th scope="col" className="text-right font-normal">
              Halal
            </th>
            <th scope="col" className="text-right font-normal">
              Conventional
            </th>
          </tr>
        </thead>
        <tbody className="text-slate-900 dark:text-slate-100">
          <tr>
            <th scope="row" className="text-left font-normal text-slate-500 dark:text-slate-400">
              Expected value (1yr)
            </th>
            <td className="text-right">{formatPercent(data.halal.finalValue.mean)}</td>
            <td className="text-right">{formatPercent(data.conventional.finalValue.mean)}</td>
          </tr>
          <tr>
            <th scope="row" className="text-left font-normal text-slate-500 dark:text-slate-400">
              Volatility (stdev)
            </th>
            <td className="text-right">{formatPercent(data.halal.finalValue.stdev)}</td>
            <td className="text-right">{formatPercent(data.conventional.finalValue.stdev)}</td>
          </tr>
          <tr>
            <th scope="row" className="text-left font-normal text-slate-500 dark:text-slate-400">
              Probability of loss
            </th>
            <td className="text-right">{formatPercent(data.halal.finalValue.probabilityOfLoss)}</td>
            <td className="text-right">{formatPercent(data.conventional.finalValue.probabilityOfLoss)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
