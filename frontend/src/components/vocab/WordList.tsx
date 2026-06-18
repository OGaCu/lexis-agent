"use client";

import { Word } from "@/lib/api";
import WordCard from "./WordCard";

interface Props {
  words: Word[];
  onDeleted: (id: string) => void;
  onUpdated: (word: Word) => void;
}

export default function WordList({ words, onDeleted, onUpdated }: Props) {
  if (words.length === 0) {
    return <p className="text-sm text-muted py-4">No words yet. Add one above.</p>;
  }
  return (
    <div className="space-y-3">
      {words.map((word, i) => (
        <div
          key={word.id}
          className="animate-fade-up"
          style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}
        >
          <WordCard word={word} onDeleted={onDeleted} onUpdated={onUpdated} />
        </div>
      ))}
    </div>
  );
}
