"use client";

import { api, QuoteRow } from "@/lib/api";

interface Props {
  rows: QuoteRow[];
  onDeleted: (ticker: string) => void;
}

function formatChange(pct: string): { color: string; prefix: string } {
  if (pct === "N/A") return { color: "text-muted", prefix: "" };
  const val = parseFloat(pct);
  if (val > 0) return { color: "text-emerald-400", prefix: "▲ " };
  if (val < 0) return { color: "text-red-400", prefix: "▼ " };
  return { color: "text-muted", prefix: "" };
}

export default function Watchlist({ rows, onDeleted }: Props) {
  async function handleDelete(ticker: string) {
    await api.invest.removeTicker(ticker);
    onDeleted(ticker);
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted mb-8">No tickers in watchlist.</p>;
  }

  return (
    <div className="mb-8 bg-surface border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto] text-xs text-muted px-4 py-2.5 border-b border-border font-display">
        <span>Ticker</span>
        <span className="text-right w-24">Price</span>
        <span className="text-right w-28">Change</span>
        <span className="w-16" />
      </div>
      {rows.map((row, i) => {
        const { color, prefix } = formatChange(row.change_percent);
        return (
          <div
            key={row.ticker}
            className={`grid grid-cols-[1fr_auto_auto_auto] px-4 py-3 items-center transition-colors hover:bg-panel ${
              i !== rows.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <span className="font-mono font-semibold text-text text-sm tracking-wider">
              {row.ticker}
            </span>
            <span className="font-mono text-sm text-text text-right w-24">{row.price}</span>
            <span className={`font-mono text-sm text-right w-28 ${color}`}>
              {prefix}{row.change_percent}
            </span>
            <div className="w-16 text-right">
              <button
                onClick={() => handleDelete(row.ticker)}
                className="text-xs text-muted hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
