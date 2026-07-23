#!/usr/bin/env bash
set -e
cd /home/ec2-user/lexis
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f
