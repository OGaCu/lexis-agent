const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Word {
  id: string;
  term: string;
  context: string | null;
  definition: string;
  usage_explanation: string;
  sample_sentences: string[];
  register: string;
  related_words: string[];
  category: string;
  status: string;
  created_at: string;
}

export interface WordUpdate {
  term?: string;
  context?: string | null;
  definition?: string;
  usage_explanation?: string;
  sample_sentences?: string[];
  register?: string;
  related_words?: string[];
  category?: string;
  status?: string;
}

export interface QuoteRow {
  ticker: string;
  price: string;
  change_percent: string;
  cached: boolean;
}

export interface WatchlistEntry {
  id: string;
  ticker: string;
  added_at: string;
}

export interface NewsItem {
  headline: string;
  implication: string;
}

export interface StockNote {
  ticker: string;
  note: string;
}

export interface BriefingContent {
  macro_summary: string;
  news_items: NewsItem[];
  stock_notes: StockNote[];
  disclaimer: string;
}

export interface Briefing {
  id: string;
  content: BriefingContent;
  created_at: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  vocab: {
    list: () => request<Word[]>("/vocab/words"),
    add: (term: string, context?: string, useAI = false) =>
      request<Word>("/vocab/words", {
        method: "POST",
        body: JSON.stringify({ term, context: context || null, use_ai: useAI }),
      }),
    update: (id: string, data: WordUpdate) =>
      request<Word>(`/vocab/words/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      request<{ deleted: string }>(`/vocab/words/${id}`, { method: "DELETE" }),
  },
  invest: {
    watchlist: () => request<QuoteRow[]>("/invest/watchlist"),
    addTicker: (ticker: string) =>
      request<WatchlistEntry>("/invest/watchlist", {
        method: "POST",
        body: JSON.stringify({ ticker }),
      }),
    removeTicker: (ticker: string) =>
      request<{ deleted: string }>(`/invest/watchlist/${ticker}`, { method: "DELETE" }),
    latestBriefing: () => request<Briefing | null>("/invest/briefings/latest"),
    generateBriefing: () =>
      request<Briefing>("/invest/briefings/generate", { method: "POST" }),
  },
};
