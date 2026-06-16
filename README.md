# Lexis

A personal AI platform with two tools: **Vocabulary Builder** and **Investment Research Assistant**.

## Prerequisites

- Docker and Docker Compose
- API keys (see below)

## Quick start

```bash
cp .env.example .env
# fill in your API keys in .env (see table below)

docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:3001 | Frontend |
| http://localhost:8000 | API gateway |
| http://localhost:8000/docs | Interactive API docs |

The database starts pre-seeded with an initial vocabulary set. Your data persists across restarts automatically — see [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## API keys

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `ALPHA_VANTAGE_API_KEY` | https://www.alphavantage.co/support/#api-key (free tier) |
| `NEWS_API_KEY` | https://newsapi.org/register (free tier) |

## Stopping

```bash
docker compose down          # stops containers, data is preserved
docker compose down -v       # stops containers AND deletes all data (irreversible)
```

## Exporting and sharing your vocabulary

Use the **Export JSON** button in the Vocabulary Builder to download all your words as a JSON file. To snapshot the current database state for other users to start with, run:

```bash
docker compose exec db pg_dump -U lexis -d lexis --data-only --table=words --column-inserts
```

Paste the resulting INSERT statements into `db/seed.sql` (with `ON CONFLICT (id) DO NOTHING` appended to each line), then commit and share the repo. Anyone running `docker compose up --build` on a fresh clone will start with your word set.

## AWS deployment

### Prerequisites

- AWS CLI configured (`aws configure`)
- ECS cluster named `lexis-cluster` with one service per task already created
- ECR repositories created (one per service)

```bash
for svc in api-gateway vocab-service invest-service scheduler frontend; do
  aws ecr create-repository --repository-name lexis-$svc
done
```

### Secrets

```bash
aws secretsmanager create-secret --name lexis/anthropic-api-key --secret-string "sk-..."
aws secretsmanager create-secret --name lexis/alpha-vantage-api-key --secret-string "..."
aws secretsmanager create-secret --name lexis/news-api-key --secret-string "..."
aws secretsmanager create-secret --name lexis/database-url --secret-string "postgresql://..."
aws secretsmanager create-secret --name lexis/redis-url --secret-string "redis://..."
aws secretsmanager create-secret --name lexis/vocab-service-url --secret-string "http://..."
aws secretsmanager create-secret --name lexis/invest-service-url --secret-string "http://..."
aws secretsmanager create-secret --name lexis/api-url --secret-string "https://..."
```

### Deploy

```bash
cd infra/ecs && ./deploy.sh
```

The script builds all images, pushes to ECR, registers task definitions, and triggers rolling deployments.

## Adding a new tool

1. **Service** — create `services/my-tool/` with `main.py`, `requirements.txt`, `Dockerfile` following the FastAPI pattern.
2. **Gateway** — add a proxy route in `services/api-gateway/main.py` and a `MY_TOOL_SERVICE_URL` env var.
3. **Frontend** — add `src/app/my-tool/page.tsx`, components under `src/components/my-tool/`, typed API wrappers in `src/lib/api.ts`, and a link in `Nav.tsx`.
4. **Database** — append `CREATE TABLE IF NOT EXISTS ...` to `db/init.sql`.
5. **Docker Compose** — add the service block mirroring the existing ones.
6. **ECS** — add a task definition JSON in `infra/ecs/task-definitions/` and update `deploy.sh`.
