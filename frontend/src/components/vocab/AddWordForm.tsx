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
    <form onSubmit={handleSubmit} className="space-y-3 mb-8">
      <div className="flex gap-2">
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Word or phrase"
          required
          className="flex-1 border border-border rounded-md px-3 py-2 text-sm bg-surface focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setUseAI((v) => !v)}
          title={useAI ? "AI is on — click to disable" : "AI is off — click to generate a full word card"}
          className={`shrink-0 text-xs px-3 py-2 rounded-md border transition-colors ${
            useAI
              ? "bg-accent text-white border-accent"
              : "bg-surface text-muted border-border hover:border-accent"
          }`}
        >
          {useAI ? "AI on" : "AI off"}
        </button>
      </div>
      <div>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Context (optional) — where you heard it"
          rows={2}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-surface focus:outline-none focus:border-accent resize-none"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-accent text-white text-sm rounded-md disabled:opacity-50"
        >
          {loading ? (useAI ? "Generating…" : "Adding…") : (useAI ? "Add with AI" : "Add word")}
        </button>
        {!useAI && (
          <span className="text-xs text-muted">Quick add — fill in details via Edit later</span>
        )}
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </form>
  );
}
