"use client";

import { useEffect, useMemo, useState } from "react";
import { api, Word } from "@/lib/api";
import AddWordForm from "@/components/vocab/AddWordForm";
import WordList from "@/components/vocab/WordList";

const REGISTERS = ["formal", "neutral", "informal", "slang", "idiomatic"];
const CATEGORIES = ["business", "technology", "social", "academic", "idiom", "general"];
const STATUSES = ["new", "learning", "mastered"];

const STATUS_ACTIVE: Record<string, string> = {
  new: "bg-panel text-text border-border",
  learning: "bg-amber-400/10 text-amber-400 border-amber-400/30",
  mastered: "bg-emerald-400/10 text-emerald-400 border-emerald-400/30",
};

function Chip({
  label,
  active,
  activeClass,
  onClick,
}: {
  label: string;
  active: boolean;
  activeClass: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-0.5 rounded-md border transition-all active:scale-95 ${
        active
          ? activeClass
          : "bg-panel/50 text-muted border-border hover:border-muted/50 hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

export default function VocabPage() {
  const [words, setWords] = useState<Word[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterRegister, setFilterRegister] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  useEffect(() => {
    api.vocab.list().then(setWords).catch(console.error);
  }, []);

  function handleAdded(word: Word) {
    setWords((prev) => [word, ...prev]);
  }

  function handleDeleted(id: string) {
    setWords((prev) => prev.filter((w) => w.id !== id));
  }

  function handleUpdated(updated: Word) {
    setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  }

  function toggle(current: string | null, value: string, setter: (v: string | null) => void) {
    setter(current === value ? null : value);
  }

  const hasFilters = !!(search || filterStatus || filterRegister || filterCategory);

  const filtered = useMemo(
    () =>
      words.filter((w) => {
        if (
          search &&
          !w.term.toLowerCase().includes(search.toLowerCase()) &&
          !w.definition.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        if (filterStatus && w.status !== filterStatus) return false;
        if (filterRegister && w.register !== filterRegister) return false;
        if (filterCategory && w.category !== filterCategory) return false;
        return true;
      }),
    [words, search, filterStatus, filterRegister, filterCategory],
  );

  function handleExport() {
    const blob = new Blob([JSON.stringify(words, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lexis-vocab-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-xl font-semibold text-text">Vocabulary</h1>
          {words.length > 0 && (
            <p className="text-xs text-muted mt-0.5">
              {words.length} word{words.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        {words.length > 0 && (
          <button onClick={handleExport} className="btn-ghost text-xs">
            Export
          </button>
        )}
      </div>

      <AddWordForm onAdded={handleAdded} />

      {words.length > 0 && (
        <div className="mb-6 space-y-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search terms or definitions…"
            className="input-field"
          />

          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-muted w-16 shrink-0 font-display">Status</span>
              {STATUSES.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={filterStatus === s}
                  activeClass={STATUS_ACTIVE[s]}
                  onClick={() => toggle(filterStatus, s, setFilterStatus)}
                />
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-muted w-16 shrink-0 font-display">Register</span>
              {REGISTERS.map((r) => (
                <Chip
                  key={r}
                  label={r}
                  active={filterRegister === r}
                  activeClass="bg-accent/10 text-accent border-accent/30"
                  onClick={() => toggle(filterRegister, r, setFilterRegister)}
                />
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-muted w-16 shrink-0 font-display">Category</span>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={filterCategory === c}
                  activeClass="bg-accent/10 text-accent border-accent/30"
                  onClick={() => toggle(filterCategory, c, setFilterCategory)}
                />
              ))}
            </div>

            {hasFilters && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilterStatus(null);
                  setFilterRegister(null);
                  setFilterCategory(null);
                }}
                className="text-xs text-muted hover:text-accent transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {words.length > 0 && filtered.length === 0 && hasFilters ? (
        <p className="text-sm text-muted">No words match the current filters.</p>
      ) : (
        <WordList words={filtered} onDeleted={handleDeleted} onUpdated={handleUpdated} />
      )}
    </div>
  );
}
