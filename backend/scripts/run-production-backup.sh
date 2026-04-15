#!/usr/bin/env bash

set -euo pipefail

STAMP="$(date +%Y%m%d%H%M)"
APP_HOME="${APP_HOME:-$HOME}"
API_ROOT_DIR="${BACKUP_API_ROOT_DIR:-$APP_HOME/api.nexusforge.en-ligne.fr}"
BACKEND_DIR="${BACKUP_BACKEND_DIR:-$API_ROOT_DIR/backend}"
BACKEND_DATA_DIR="${BACKUP_BACKEND_DATA_DIR:-$BACKEND_DIR/data}"
REMOTE_HOST="${BACKUP_REMOTE_HOST:-fremaux.biz}"
REMOTE_USER="${BACKUP_REMOTE_USER:-root}"
REMOTE_DIR="${BACKUP_REMOTE_DIR:-/mnt/kraken/Backups/nexusforge_backups}"
SSH_KEY="${BACKUP_SSH_KEY:-$APP_HOME/.ssh/id_rsa_codex}"
ARCHIVE_NAME="${STAMP}-nexusforge-production-data.tar.gz"
TMP_DIR="$(mktemp -d)"
ARCHIVE_PATH="$TMP_DIR/$ARCHIVE_NAME"
STAGE_DIR="$TMP_DIR/stage"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

if [[ ! -d "$BACKEND_DIR" ]]; then
  echo "Backend directory not found: $BACKEND_DIR" >&2
  exit 1
fi

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

mkdir -p "$STAGE_DIR"
mkdir -p "$STAGE_DIR/api-root" "$STAGE_DIR/backend" "$STAGE_DIR/backend/data"

if [[ -f "$API_ROOT_DIR/.htaccess" ]]; then
  cp -a "$API_ROOT_DIR/.htaccess" "$STAGE_DIR/api-root/.htaccess"
fi

if [[ -f "$BACKEND_DIR/.env" ]]; then
  cp -a "$BACKEND_DIR/.env" "$STAGE_DIR/backend/.env"
fi

if [[ -f "$BACKEND_DIR/.env.example" ]]; then
  cp -a "$BACKEND_DIR/.env.example" "$STAGE_DIR/backend/.env.example"
fi

if [[ -f "$BACKEND_DATA_DIR/state.json" ]]; then
  cp -a "$BACKEND_DATA_DIR/state.json" "$STAGE_DIR/backend/data/state.json"
fi

if [[ -f "$BACKEND_DATA_DIR/persist-log.jsonl" ]]; then
  cp -a "$BACKEND_DATA_DIR/persist-log.jsonl" "$STAGE_DIR/backend/data/persist-log.jsonl"
fi

if [[ -d "$BACKEND_DATA_DIR/history" ]]; then
  mkdir -p "$STAGE_DIR/backend/data/history"
  cp -a "$BACKEND_DATA_DIR/history/." "$STAGE_DIR/backend/data/history/"
fi

if [[ -d "$BACKEND_DATA_DIR/resources" ]]; then
  mkdir -p "$STAGE_DIR/backend/data/resources"
  find "$BACKEND_DATA_DIR/resources" -maxdepth 1 -type f \
    ! -name '*-thumb.webp' \
    ! -name '*-preview.webp' \
    -exec cp -a {} "$STAGE_DIR/backend/data/resources/" \;
fi

tar -C "$STAGE_DIR" -czf "$ARCHIVE_PATH" .

ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" \
  "mkdir -p '$REMOTE_DIR'"

scp -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=no \
  "$ARCHIVE_PATH" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/$ARCHIVE_NAME"

ARCHIVE_SIZE="$(stat -c %s "$ARCHIVE_PATH")"

printf '{"ok":true,"archiveName":"%s","archiveSizeBytes":%s,"remoteHost":"%s","remoteDir":"%s"}\n' \
  "$ARCHIVE_NAME" "$ARCHIVE_SIZE" "$REMOTE_HOST" "$REMOTE_DIR"
