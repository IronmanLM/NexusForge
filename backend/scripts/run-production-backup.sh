#!/usr/bin/env bash

set -euo pipefail

STAMP="$(date +%Y%m%d%H%M)"
APP_HOME="${APP_HOME:-$HOME}"
FRONTEND_DIR="${BACKUP_FRONTEND_DIR:-$APP_HOME/nexusforge.en-ligne.fr}"
API_ROOT_DIR="${BACKUP_API_ROOT_DIR:-$APP_HOME/api.nexusforge.en-ligne.fr}"
BACKEND_DIR="${BACKUP_BACKEND_DIR:-$API_ROOT_DIR/backend}"
REMOTE_HOST="${BACKUP_REMOTE_HOST:-fremaux.biz}"
REMOTE_USER="${BACKUP_REMOTE_USER:-root}"
REMOTE_DIR="${BACKUP_REMOTE_DIR:-/mnt/kraken/Backups/nexusforge_backups}"
SSH_KEY="${BACKUP_SSH_KEY:-$APP_HOME/.ssh/id_rsa_codex}"
ARCHIVE_NAME="${STAMP}-nexusforge-production.tar.gz"
TMP_DIR="$(mktemp -d)"
ARCHIVE_PATH="$TMP_DIR/$ARCHIVE_NAME"
STAGE_DIR="$TMP_DIR/stage"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "Frontend directory not found: $FRONTEND_DIR" >&2
  exit 1
fi

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "Backend directory not found: $BACKEND_DIR" >&2
  exit 1
fi

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

mkdir -p "$STAGE_DIR"
mkdir -p "$STAGE_DIR/frontend" "$STAGE_DIR/api-root" "$STAGE_DIR/backend"

cp -a "$FRONTEND_DIR/." "$STAGE_DIR/frontend/"

if [[ -f "$API_ROOT_DIR/.htaccess" ]]; then
  cp -a "$API_ROOT_DIR/.htaccess" "$STAGE_DIR/api-root/.htaccess"
fi

for item in package.json package-lock.json README.md .env .env.example src data; do
  if [[ -e "$BACKEND_DIR/$item" ]]; then
    cp -a "$BACKEND_DIR/$item" "$STAGE_DIR/backend/"
  fi
done

tar -C "$STAGE_DIR" -czf "$ARCHIVE_PATH" .

ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" \
  "mkdir -p '$REMOTE_DIR'"

scp -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=no \
  "$ARCHIVE_PATH" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/$ARCHIVE_NAME"

ARCHIVE_SIZE="$(stat -c %s "$ARCHIVE_PATH")"

printf '{"ok":true,"archiveName":"%s","archiveSizeBytes":%s,"remoteHost":"%s","remoteDir":"%s"}\n' \
  "$ARCHIVE_NAME" "$ARCHIVE_SIZE" "$REMOTE_HOST" "$REMOTE_DIR"
