"use client";

import { useState } from "react";
import { api, Word, WordUpdate } from "@/lib/api";

interface Props {
  word: Word;
  onDeleted: (id: string) => void;
  onUpdated: (word: Word) => void;
}

const REGISTERS = ["formal", "neutral", "informal", "slang", "idiomatic"];
const CATEGORIES = ["business", "technology", "social", "academic", "idiom", "general"];
const STATUSES = ["new", "learning", "mastered"];

const STATUS_BADGE: Record<string, string> = {
  new: "bg-panel text-muted",
  learning: "bg-amber-400/10 text-amber-400",
  mastered: "bg-emerald-400/10 text-emerald-400",
};

interface Draft {
  term: string;
  context: string;
  definition: string;
  usage_explanation: string;
  sample_sentences: string;
  register: string;
  related_words: string;
  category: string;
  status: string;
}

function draftFromWord(word: Word): Draft {
  return {
    term: word.term,
    context: word.context ?? "",
    definition: word.definition,
    usage_explanation: word.usage_explanation,
    sample_sentences: word.sample_sentences.join("\n"),
    register: word.register,
    related_words: word.related_words.join(", "),
    category: word.category,
    status: word.status ?? "new",
  };
}

export default function WordCard({ word, onDeleted, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(draftFromWord(word));

  function startEdit() {
    setDraft(draftFromWord(word));
    setEditing(true);
  }

  function set(key: keyof Draft, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: WordUpdate = {
        term: draft.term.trim() || word.term,
        context: draft.context.trim() || null,
        definition: draft.definition.trim(),
        usage_explanation: draft.usage_explanation.trim(),
        sample_sentences: draft.sample_sentences
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        register: draft.register,
        related_words: draft.related_words
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        category: draft.category,
        status: draft.status,
      };
      const updated = await api.vocab.update(word.id, payload);
      onUpdated(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await api.vocab.remove(word.id);
    onDeleted(word.id);
  }

  if (editing) {
    return (
      <div className="bg-panel border border-accent/30 rounded-xl p-4 space-y-3 animate-fade-up">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-xs">Term</label>
            <input
              value={draft.term}
              onChange={(e) => set("term", e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-xs">Context (optional)</label>
            <input
              value={draft.context}
              onChange={(e) => set("context", e.target.value)}
              placeholder="where you heard it"
              className="input-field"
            />
          </div>
        </div>

        <div>
          <label className="label-xs">Definition</label>
          <textarea
            value={draft.definition}
            onChange={(e) => set("definition", e.target.value)}
            rows={2}
            className="input-field resize-none"
          />
        </div>

        <div>
          <label className="label-xs">Usage explanation</label>
          <textarea
            value={draft.usage_explanation}
            onChange={(e) => set("usage_explanation", e.target.value)}
            rows={2}
            className="input-field resize-none"
          />
        </div>

        <div>
          <label className="label-xs">Sample sentences (one per line)</label>
          <textarea
            value={draft.sample_sentences}
            onChange={(e) => set("sample_sentences", e.target.value)}
            rows={3}
            className="input-field resize-none"
          />
        </div>

        <div>
          <label className="label-xs">Related words (comma-separated)</label>
          <input
            value={draft.related_words}
            onChange={(e) => set("related_words", e.target.value)}
            className="input-field"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label-xs">Register</label>
            <select
              value={draft.register}
              onChange={(e) => set("register", e.target.value)}
              className="input-field"
            >
              {REGISTERS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-xs">Category</label>
            <select
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              className="input-field"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-xs">Status</label>
            <select
              value={draft.status}
              onChange={(e) => set("status", e.target.value)}
              className="input-field"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-sm text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const statusBadge = STATUS_BADGE[word.status ?? "new"] ?? STATUS_BADGE.new;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-text leading-snug">
          {word.term}
        </h2>
        <span className={`text-xs px-2 py-0.5 rounded-md shrink-0 font-mono ${statusBadge}`}>
          {word.status ?? "new"}
        </span>
      </div>

      <p className="text-sm text-muted mt-1.5 leading-relaxed">{word.definition}</p>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-3 animate-fade-up">
          <p className="text-sm text-muted/80 leading-relaxed">{word.usage_explanation}</p>

          <ol className="text-sm space-y-1.5 list-none">
            {word.sample_sentences.map((s, i) => (
              <li key={i} className="flex gap-2 text-text/80">
                <span className="font-mono text-accent/40 shrink-0 text-xs pt-0.5 w-4">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>

          {word.related_words.length > 0 && (
            <p className="text-xs text-muted">
              Related:{" "}
              <span className="text-text/70">{word.related_words.join(", ")}</span>
            </p>
          )}

          <div className="flex gap-1.5 flex-wrap">
            <span className="text-xs bg-panel text-muted px-2 py-0.5 rounded-md font-mono">
              {word.register}
            </span>
            <span className="text-xs bg-panel text-muted px-2 py-0.5 rounded-md font-mono">
              {word.category}
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-4 mt-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted hover:text-accent transition-colors"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
        <button
          onClick={startEdit}
          className="text-xs text-muted hover:text-accent transition-colors"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          className="text-xs text-muted hover:text-red-400 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
