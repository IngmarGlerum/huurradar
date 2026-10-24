#!/usr/bin/env bash
# Op de VM: nieuwste code ophalen en de worker opnieuw bouwen en starten.
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
