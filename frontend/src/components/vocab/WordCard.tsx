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
  new: "bg-base text-muted",
  learning: "bg-amber-100 text-amber-700",
  mastered: "bg-emerald-100 text-emerald-700",
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

const inputCls =
  "w-full border border-border rounded px-2 py-1.5 text-sm bg-base focus:outline-none focus:border-accent";
const labelCls = "block text-xs text-muted mb-1";

export default function WordCard({ word, onDeleted, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
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
      <div className="bg-surface border border-accent rounded-md p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Term</label>
            <input
              value={draft.term}
              onChange={(e) => set("term", e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Context (optional)</label>
            <input
              value={draft.context}
              onChange={(e) => set("context", e.target.value)}
              placeholder="where you heard it"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Definition</label>
          <textarea
            value={draft.definition}
            onChange={(e) => set("definition", e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>

        <div>
          <label className={labelCls}>Usage explanation</label>
          <textarea
            value={draft.usage_explanation}
            onChange={(e) => set("usage_explanation", e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>

        <div>
          <label className={labelCls}>Sample sentences (one per line)</label>
          <textarea
            value={draft.sample_sentences}
            onChange={(e) => set("sample_sentences", e.target.value)}
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </div>

        <div>
          <label className={labelCls}>Related words (comma-separated)</label>
          <input
            value={draft.related_words}
            onChange={(e) => set("related_words", e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Register</label>
            <select
              value={draft.register}
              onChange={(e) => set("register", e.target.value)}
              className={inputCls}
            >
              {REGISTERS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              className={inputCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select
              value={draft.status}
              onChange={(e) => set("status", e.target.value)}
              className={inputCls}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 bg-accent text-white text-sm rounded disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-sm text-muted hover:text-text"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_BADGE[word.status] ?? "bg-base text-muted";

  return (
    <div className="bg-surface border border-border rounded-md p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold text-text">{word.term}</h2>
        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
          <span className={`text-xs px-2 py-0.5 rounded ${statusStyle}`}>
            {word.status ?? "new"}
          </span>
          <span className="text-xs bg-base text-muted px-2 py-0.5 rounded">{word.register}</span>
          <span className="text-xs bg-base text-muted px-2 py-0.5 rounded">{word.category}</span>
        </div>
      </div>

      <p className="text-sm text-text">{word.definition}</p>
      <p className="text-sm text-muted">{word.usage_explanation}</p>

      <ol className="text-sm space-y-1 list-decimal list-inside text-text">
        {word.sample_sentences.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      {word.related_words.length > 0 && (
        <p className="text-sm text-muted">
          Related: {word.related_words.join(", ")}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={startEdit}
          className="text-sm text-muted hover:text-accent transition-colors"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          className="text-sm text-muted hover:text-red-600 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
