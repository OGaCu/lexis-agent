#!/usr/bin/env bash
#
# dump-seed.sh — snapshot the LIVE words table on the EC2 server back into
# db/seed.sql, so a fresh EC2 (new db volume) re-seeds with the same data.
#
# Run this FROM YOUR LAPTOP. It SSHes to the server, dumps the words table,
# rewrites every row as an idempotent `INSERT ... ON CONFLICT (id) DO NOTHING`,
# and overwrites db/seed.sql in this repo. Then review the diff and commit.
#
# Usage:
#   EC2_HOST=54.123.45.67 ./infra/dump-seed.sh
#
# Optional overrides (env vars, with defaults):
#   EC2_HOST      required — server public IP / DNS
#   EC2_USER      ec2-user           (use "ubuntu" on Ubuntu AMIs)
#   SSH_KEY       ~/.ssh/lexis-key.pem
#   REMOTE_DIR    ~/lexis            (where the repo is cloned on the server)
#   COMPOSE_FILE  docker-compose.prod.yml
#
set -euo pipefail

EC2_HOST="${EC2_HOST:?set EC2_HOST=<server ip/dns>}"
EC2_USER="${EC2_USER:-ec2-user}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/lexis-key.pem}"
REMOTE_DIR="${REMOTE_DIR:-~/lexis}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

# Resolve repo root from this script's location, so it works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_FILE="$SCRIPT_DIR/../db/seed.sql"

echo "Dumping words table from $EC2_USER@$EC2_HOST ..." >&2

# --column-inserts    -> one `INSERT INTO public.words (...) VALUES (...)` per row
#                        (plain --data-only emits COPY, which we can't transform)
# --rows-per-insert=1  -> exactly one row per line, so the sed transforms are line-safe
# --no-owner           -> drop `OWNER TO` noise
REMOTE_CMD="cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE exec -T db \
  pg_dump -U lexis -d lexis -t words --data-only --column-inserts \
  --rows-per-insert=1 --no-owner"

# Write to a temp file first; only replace seed.sql if the dump succeeds and is
# non-empty, so a failed SSH never leaves you with a truncated seed.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  echo "-- Seed data: vocabulary words snapshot (single source of truth)."
  echo "-- Generated from the production words table by infra/dump-seed.sh."
  echo "-- ON CONFLICT (id) DO NOTHING makes every INSERT idempotent — safe to"
  echo "-- re-run against a db that already has rows."
  echo ""
  echo "SET client_encoding = 'UTF8';"
  echo ""
  ssh -i "$SSH_KEY" "$EC2_USER@$EC2_HOST" "$REMOTE_CMD" \
    | grep '^INSERT INTO' \
    | sed 's/^INSERT INTO public\.words/INSERT INTO words/' \
    | sed 's/);[[:space:]]*$/) ON CONFLICT (id) DO NOTHING;/'
} > "$TMP"

# Sanity check: did we actually get any rows?
ROWS="$(grep -c '^INSERT INTO words' "$TMP" || true)"
if [ "$ROWS" -eq 0 ]; then
  echo "ERROR: dump produced 0 rows — leaving db/seed.sql untouched." >&2
  echo "Check EC2_HOST/SSH_KEY, and that the db container is running on the server." >&2
  exit 1
fi

mv "$TMP" "$SEED_FILE"
trap - EXIT

echo "Wrote $ROWS rows to db/seed.sql" >&2
echo "Next: review and commit ->  git diff db/seed.sql && git add db/seed.sql && git commit -m 'chore(db): refresh seed from prod'" >&2
