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
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-semibold text-text">Market Briefing</h2>
          <p className="text-xs text-muted mt-0.5">AI-generated analysis of your watchlist</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="btn-ghost text-xs disabled:opacity-40"
        >
          {loading ? "Generating…" : "Generate"}
        </button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {!briefing && !loading && (
        <p className="text-sm text-muted">No briefing yet — click Generate above.</p>
      )}

      {briefing && (
        <div className="space-y-5 text-sm animate-fade-up">
          <p className="text-text/80 leading-relaxed">{briefing.content.macro_summary}</p>

          {briefing.content.news_items.length > 0 && (
            <div>
              <h3 className="font-display text-xs uppercase tracking-wider text-muted mb-3">
                News
              </h3>
              <ul className="space-y-3">
                {briefing.content.news_items.map((item, i) => (
                  <li key={i} className="border-l border-accent/30 pl-3">
                    <p className="font-medium text-text">{item.headline}</p>
                    <p className="text-muted text-xs mt-0.5">{item.implication}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {briefing.content.stock_notes.length > 0 && (
            <div>
              <h3 className="font-display text-xs uppercase tracking-wider text-muted mb-3">
                Portfolio
              </h3>
              <ul className="space-y-1.5">
                {briefing.content.stock_notes.map((note, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="font-mono font-semibold text-accent w-14 shrink-0 text-xs pt-0.5">
                      {note.ticker}
                    </span>
                    <span className="text-muted text-xs leading-relaxed">{note.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted/50 border-t border-border pt-3">
            {briefing.content.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}
