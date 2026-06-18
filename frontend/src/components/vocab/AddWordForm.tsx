"use client";

import { useState } from "react";
import { api, Word } from "@/lib/api";

interface Props {
  onAdded: (word: Word) => void;
}

export default function AddWordForm({ onAdded }: Props) {
  const [term, setTerm] = useState("");
  const [context, setContext] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const word = await api.vocab.add(term.trim(), context.trim() || undefined, useAI);
      onAdded(word);
      setTerm("");
      setContext("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add word");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 mb-8">
      <div className="flex gap-2">
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Word or phrase"
          required
          className="input-field"
        />
        <button
          type="button"
          onClick={() => setUseAI((v) => !v)}
          title={
            useAI
              ? "AI is on — click to disable"
              : "AI is off — click to generate a full word card"
          }
          className={`shrink-0 text-xs px-3 py-2 rounded-lg border font-mono transition-all ${
            useAI
              ? "bg-accent/15 text-accent border-accent/40"
              : "bg-panel text-muted border-border hover:border-muted/50 hover:text-text"
          }`}
        >
          AI {useAI ? "on" : "off"}
        </button>
      </div>

      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="Context — where you encountered this word (optional)"
        rows={2}
        className="input-field resize-none"
      />

      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading
            ? useAI
              ? "Generating…"
              : "Adding…"
            : useAI
            ? "Add with AI"
            : "Add word"}
        </button>
        {!useAI && (
          <span className="text-xs text-muted/60">Fill in details later via Edit</span>
        )}
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </form>
  );
}
