#!/usr/bin/env bash
#
# user-data.sh — EC2 first-boot bootstrap for the Lexis vocab stack.
#
# This is the "code" half of the hybrid launch (see infra/FAST-LAUNCH.md):
# the AMI already has the slow, stable parts baked in (Docker, git, the 2 GB swap
# file). This script runs ONCE on first boot and does only the fast, changing part:
# fetch the latest code and start the stack. Result: a fresh instance serves the
# API on :8000 a minute or two after it reaches "running", with zero manual steps.
#
# How to use it: paste the contents into the EC2 "User data" box (Advanced details
# when launching), or attach it to a Launch Template. Cloud-init runs it as root.
#
# Assumptions (all satisfied by the baked AMI — see infra/FAST-LAUNCH.md):
#   - docker + the compose v2 plugin are installed and docker is enabled on boot
#   - git is installed
#   - the 2 GB swap file exists (Next.js/pip builds OOM on 1 GB without it)
#
# Tunables — edit these two before baking/launching:
REPO_URL="https://github.com/OGaCu/lexis-agent.git"   # your repo (HTTPS; use a deploy token if private)
APP_USER="ec2-user"                                    # "ubuntu" on Ubuntu AMIs
# --------------------------------------------------------------------------------
set -euxo pipefail

APP_HOME="/home/$APP_USER"
APP_DIR="$APP_HOME/lexis"   # CodeDeploy also expects exactly ~/lexis

# 1. Fetch the code (clone on a truly fresh box, pull if the AMI already had it).
if [ -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" pull origin main
else
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
fi

# 2. Ensure a .env exists. A minimal, key-less .env is enough to VIEW data
#    (the seed words load automatically on first boot). Add ANTHROPIC_API_KEY
#    later — SSH in and edit ~/lexis/.env — to enable AI "add word" enrichment.
#    Never bake real secrets into user-data or the AMI; this only writes the file
#    if one is not already present, so a hand-edited .env is never clobbered.
if [ ! -f "$APP_DIR/.env" ]; then
  sudo -u "$APP_USER" tee "$APP_DIR/.env" >/dev/null <<'EOF'
DATABASE_URL=postgresql://lexis:lexis@db:5432/lexis
VOCAB_SERVICE_URL=http://vocab-service:8001
ANTHROPIC_API_KEY=
NOTION_API_KEY=
NOTION_DATABASE_ID=
EOF
fi

# 3. Build and start the stack (API only; add COMPOSE_PROFILES=web to .env for the UI).
cd "$APP_DIR"
sudo -u "$APP_USER" docker compose -f docker-compose.prod.yml up -d --build
sudo -u "$APP_USER" docker image prune -f   # reclaim disk on the small free-tier volume
