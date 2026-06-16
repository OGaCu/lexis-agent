# Architecture

> Lexis uses **FastAPI** — a modern async Python web framework ( Not Django). Django is a batteries-included monolith; FastAPI is a lightweight, async-first micro-framework closer in spirit to Express (Node) or Flask, but with automatic OpenAPI docs and built-in type validation via Pydantic.

## Stack at a glance

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14 (React, TypeScript) | App Router, server-side rendering, standalone Docker output |
| API gateway | FastAPI (Python) | Single entry point, CORS, request proxying |
| Services | FastAPI (Python) | One process per domain (vocab, invest, scheduler) |
| Database | PostgreSQL 15 | Relational, JSONB for arrays, strong typing |
| Cache / queue | Redis 7 | Rate-limiting, scheduled job coordination |
| AI | Anthropic Claude (claude-sonnet-4-6) | Word enrichment, investment briefings |

## Request flow

```
Browser
  │  fetch("http://localhost:8000/vocab/words", { method: "POST" })
  ▼
api-gateway :8000
  │  httpx.request("POST", "http://vocab-service:8001/words", ...)
  ▼
vocab-service :8001
  │  calls Anthropic API (if use_ai=true)
  │  INSERT INTO words ...
  ▼
PostgreSQL :5432
  │  persists to Docker volume  lexis_db_data
  ▼
Response bubbles back up through the same chain
```

The gateway is a **thin proxy** — it adds CORS headers and routes by path prefix (`/vocab/*` → vocab-service, `/invest/*` → invest-service). It holds no business logic and no database connection.

## Service breakdown

### `api-gateway`
- Single `main.py`; no database
- Strips the `host` header before forwarding (required for HTTP/1.1 proxying)
- Sets `timeout=60s` on proxied requests to accommodate AI response latency

### `vocab-service`
- `POST /words` — optionally calls Claude to generate definition, usage, sample sentences, register, related words, category; otherwise saves a bare record for manual editing
- `PATCH /words/{id}` — partial update of any field; uses `model_dump(exclude_unset=True)` so only explicitly sent fields are written
- `GET /words` — returns all words ordered newest-first
- `DELETE /words/{id}`
- **Startup migration**: runs `ALTER TABLE words ADD COLUMN IF NOT EXISTS status …` every boot — idempotent, handles adding new columns without recreating the volume

### `invest-service`
- Manages a watchlist of stock tickers
- Fetches live quotes from Alpha Vantage, cached in Redis to avoid rate limits
- Generates investment briefings via Claude based on news (NewsAPI) and portfolio

### `scheduler`
- Standalone Python process (not FastAPI); runs `while True` loop
- Calls invest-service endpoints on a timer to pre-cache daily briefings

### `frontend`
- Next.js with `output: "standalone"` — produces a self-contained Node.js server with no dev dependencies, suitable for Docker
- All data fetching is **client-side** (`"use client"` components with `fetch`); no Next.js server actions or API routes
- `NEXT_PUBLIC_API_URL` is baked at build time; falls back to `http://localhost:8000` if unset — this is intentional for local Docker use

## Database design

```sql
words (
  id               UUID PRIMARY KEY,
  term             TEXT NOT NULL,        -- the word/phrase
  context          TEXT,                 -- where the user heard it
  definition       TEXT,
  usage_explanation TEXT,
  sample_sentences JSONB,               -- ["sentence 1", "sentence 2", ...]
  register         TEXT,                -- formal | neutral | informal | slang | idiomatic
  related_words    JSONB,               -- ["word1", "word2"]
  category         TEXT,                -- business | technology | social | academic | idiom | general
  status           TEXT DEFAULT 'new',  -- new | learning | mastered
  created_at       TIMESTAMPTZ DEFAULT now()
)
```

`sample_sentences` and `related_words` are `JSONB` (PostgreSQL's binary JSON type) rather than separate junction tables — the data is always read and written as a whole array and never queried element-by-element, so a join table would add complexity with no benefit.

All other fields are flat `TEXT`. No ORM is used; queries are hand-written SQL via the `databases` async library (which wraps `asyncpg` under the hood).

## Data persistence

```
docker compose up       → containers start, volume already exists → data intact
docker compose down     → containers stop, volume untouched       → data intact
docker compose down -v  → containers stop, volume DELETED         → data gone
```

PostgreSQL's `/docker-entrypoint-initdb.d/` directory accepts SQL files that run **once** when the volume is first created (alphabetical order):

```
01_init.sql  →  CREATE TABLE IF NOT EXISTS ...   (schema)
02_seed.sql  →  INSERT ... ON CONFLICT DO NOTHING  (pre-loaded words)
```

After first boot, both files are skipped on every subsequent start. New columns are handled by `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in the service startup hook, not in `init.sql`, because `init.sql` won't re-run on an existing volume.

## Adding a schema change

1. Add `ALTER TABLE words ADD COLUMN IF NOT EXISTS new_col TEXT DEFAULT ''` to the `startup()` function in `vocab-service/main.py`
2. Update `db/init.sql` with the column so fresh installs get it from the start
3. Update `_serialize()` to include the new field in API responses
4. Update `PatchWordRequest` and the frontend `Word` interface / `WordUpdate` type

## Environment variables

All secrets and service URLs live in `.env` and are injected via `env_file: .env` in docker-compose. The frontend receives only `NEXT_PUBLIC_API_URL` (public, browser-visible). Nothing sensitive is passed to the frontend container.

## Key files

```
services/
  api-gateway/main.py      proxy router
  vocab-service/main.py    vocab CRUD + AI enrichment
  invest-service/main.py   watchlist + briefings
  scheduler/main.py        background job loop
frontend/src/
  lib/api.ts               typed fetch wrappers (single source of API truth)
  app/vocab/page.tsx        vocab page with filter state
  components/vocab/
    AddWordForm.tsx         add form with AI toggle
    WordCard.tsx            view + inline edit card
    WordList.tsx            list renderer
db/
  init.sql                 table schema (runs once on fresh volume)
  seed.sql                 pre-loaded word data (runs once on fresh volume)
docker-compose.yml         service wiring, volume mounts, port mappings
.env                       secrets (never commit this file)
.env.example               template for new developers
```
