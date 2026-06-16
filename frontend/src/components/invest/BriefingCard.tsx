"use client";

import { useState } from "react";
import { api, Briefing } from "@/lib/api";

interface Props {
  initial: Briefing | null;
}

export default function BriefingCard({ initial }: Props) {
  const [briefing, setBriefing] = useState<Briefing | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const b = await api.invest.generateBriefing();
      setBriefing(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate briefing");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-border rounded-md bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text">Market Briefing</h2>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="text-sm px-3 py-1.5 border border-border rounded-md text-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate briefing"}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!briefing && !loading && (
        <p className="text-sm text-muted">No briefing yet. Click Generate.</p>
      )}

      {briefing && (
        <div className="space-y-4 text-sm">
          <p className="text-text">{briefing.content.macro_summary}</p>

          {briefing.content.news_items.length > 0 && (
            <div>
              <h3 className="font-medium text-text mb-2">News</h3>
              <ul className="space-y-2">
                {briefing.content.news_items.map((item, i) => (
                  <li key={i} className="border-l-2 border-border pl-3">
                    <p className="font-medium">{item.headline}</p>
                    <p className="text-muted">{item.implication}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {briefing.content.stock_notes.length > 0 && (
            <div>
              <h3 className="font-medium text-text mb-2">Portfolio</h3>
              <ul className="space-y-1">
                {briefing.content.stock_notes.map((note, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-semibold text-accent w-12 shrink-0">{note.ticker}</span>
                    <span className="text-muted">{note.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted border-t border-border pt-3">
            {briefing.content.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}
