CREATE TABLE IF NOT EXISTS words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  context TEXT,
  definition TEXT,
  usage_explanation TEXT,
  sample_sentences JSONB,
  register TEXT,
  related_words JSONB,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL UNIQUE,
  added_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
