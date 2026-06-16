"use client";

import { api, QuoteRow } from "@/lib/api";

interface Props {
  rows: QuoteRow[];
  onDeleted: (ticker: string) => void;
}

function changeColor(pct: string): string {
  if (pct === "N/A") return "text-muted";
  const val = parseFloat(pct);
  if (val > 0) return "text-green-600";
  if (val < 0) return "text-red-600";
  return "text-text";
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
    <table className="w-full text-sm mb-8 border border-border rounded-md overflow-hidden">
      <thead className="bg-base text-muted">
        <tr>
          <th className="text-left px-3 py-2 font-medium">Ticker</th>
          <th className="text-right px-3 py-2 font-medium">Price</th>
          <th className="text-right px-3 py-2 font-medium">Change</th>
          <th className="px-3 py-2" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.ticker} className="border-t border-border bg-surface">
            <td className="px-3 py-2 font-semibold text-text">{row.ticker}</td>
            <td className="px-3 py-2 text-right text-text">{row.price}</td>
            <td className={`px-3 py-2 text-right ${changeColor(row.change_percent)}`}>
              {row.change_percent}
            </td>
            <td className="px-3 py-2 text-right">
              <button
                onClick={() => handleDelete(row.ticker)}
                className="text-muted hover:text-red-600 transition-colors"
              >
                Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
