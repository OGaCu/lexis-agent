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
    return <p className="text-sm text-muted">No words yet. Add one above.</p>;
  }
  return (
    <div className="space-y-4">
      {words.map((word) => (
        <WordCard key={word.id} word={word} onDeleted={onDeleted} onUpdated={onUpdated} />
      ))}
    </div>
  );
}
