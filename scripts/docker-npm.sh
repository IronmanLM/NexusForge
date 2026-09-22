#!/bin/sh
# Tests frontend sans node local : utilise Docker (image node:22-slim).
# Usage : ./scripts/docker-npm.sh [args npm...]  (défaut : run build)
# Ex.   : ./scripts/docker-npm.sh run typecheck
set -eu
cd "$(dirname "$0")/.."
ARGS="${*:-run build}"
docker run --rm -v "$PWD/frontend:/app" -w /app node:22-slim sh -c "npm ci --no-audit --no-fund >/dev/null 2>&1; npm $ARGS"
