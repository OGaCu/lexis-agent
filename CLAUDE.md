# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
cp .env.example .env          # fill in API keys before first run
docker compose up --build     # build and run everything
docker compose down           # stop, keep data
docker compose down -v        # stop, DELETE all data (irreversible)
```

There is no test suite, linter, or formatter configured in this repo (frontend `package.json` only has `dev`/`build`/`start`; Python services have no pytest/flake8 setup). Don't assume tooling that isn't there.

Frontend dev server (outside Docker): `cd frontend && npm install && npm run dev`. Python services run via Docker only — there's no local venv setup; to iterate on one service, rebuild just that container: `docker compose up --build vocab-service`.

Service URLs when running: frontend `:3001`, API gateway `:8000` (interactive docs at `:8000/docs`).

## Architecture

Full details are in `ARCHITECTURE.md` — read it before making structural changes. Key points:

- **Topology**: Next.js frontend → `api-gateway` (thin proxy, no DB, no business logic, routes by path prefix `/vocab/*` and `/invest/*`) → per-domain FastAPI services (`vocab-service`, `invest-service`) → Postgres. `scheduler` is a standalone `while True` loop (not FastAPI) that pre-warms invest-service briefings on a timer. Redis is used for caching/rate-limiting, not as a message queue.
- **No ORM**: hand-written SQL via the `databases`/`asyncpg` async library throughout.
- **Schema migrations are not files**: `db/init.sql` only runs once, on first volume creation. Adding a column later means adding `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to the service's `startup()` hook (see `vocab-service/main.py`) *and* updating `db/init.sql` so fresh installs match. Both steps are required — see "Adding a schema change" in ARCHITECTURE.md for the full 4-step checklist (also touches `_serialize()` and the Pydantic/TS types).
- **JSONB over join tables**: `sample_sentences` and `related_words` are JSONB arrays, not normalized — intentional, since they're always read/written whole.
- **Frontend data fetching is entirely client-side** (`"use client"` + `fetch`), no Next.js server actions/route handlers. `frontend/src/lib/api.ts` is the single source of truth for typed API calls — update it alongside any gateway/service endpoint change.
- **`NEXT_PUBLIC_API_URL` is baked in at build time**, defaulting to `http://localhost:8000` for local Docker use; this is intentional, not a bug.
- Secrets/service URLs live only in `.env` (gitignored); the frontend container receives only `NEXT_PUBLIC_API_URL`.

## Adding a new tool/service

Follow the existing FastAPI pattern (see README.md "Adding a new tool" for the full checklist): new service under `services/<name>/` (`main.py`, `requirements.txt`, `Dockerfile`), a proxy route + `<NAME>_SERVICE_URL` env var in `api-gateway/main.py`, frontend page/components/`api.ts` wrappers + `Nav.tsx` link, schema additions in `db/init.sql`, a `docker-compose.yml` service block, and an ECS task definition + `deploy.sh` update under `infra/ecs/`.

## AWS deployment

ECS-based; deploy via `cd infra/ecs && ./deploy.sh` (builds images, pushes to ECR, registers task definitions, triggers rolling deploys). Requires an existing `lexis-cluster` ECS cluster, one ECR repo per service, and secrets pre-created in AWS Secrets Manager (`lexis/anthropic-api-key`, etc. — see README.md for the full list). Treat any change to `infra/ecs/` or `deploy.sh` as touching shared infrastructure.
