"use client";

import { useState } from "react";
import { api, QuoteRow } from "@/lib/api";

interface Props {
  onAdded: (row: QuoteRow) => void;
}

export default function AddTickerForm({ onAdded }: Props) {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.invest.addTicker(ticker.trim().toUpperCase());
      const watchlist = await api.invest.watchlist();
      const added = watchlist.find((r) => r.ticker === ticker.trim().toUpperCase());
      if (added) onAdded(added);
      setTicker("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add ticker");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
      <input
        type="text"
        value={ticker}
        onChange={(e) => setTicker(e.target.value.toUpperCase())}
        placeholder="Ticker symbol"
        maxLength={5}
        required
        className="border border-border rounded-md px-3 py-2 text-sm bg-surface focus:outline-none focus:border-accent w-36"
      />
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-accent text-white text-sm rounded-md disabled:opacity-50"
      >
        {loading ? "Adding..." : "Add"}
      </button>
      {error && <p className="text-red-600 text-sm self-center">{error}</p>}
    </form>
  );
}
