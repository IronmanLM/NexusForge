#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="${ROOT_DIR}/android"
source "${ROOT_DIR}/scripts/mobile-android-env.sh"

echo "== Nexus Forge Android doctor =="
echo "Frontend: ${ROOT_DIR}"
echo "Android shell: ${ANDROID_DIR}"

fail=0

check_cmd() {
  local name="$1"
  if command -v "${name}" >/dev/null 2>&1; then
    echo "[ok] ${name}: $(command -v "${name}")"
  else
    echo "[ko] ${name} introuvable"
    fail=1
  fi
}

check_cmd node
check_cmd npm
check_cmd java

echo
echo "== Variables Android =="
echo "JAVA_HOME=${JAVA_HOME:-}"
echo "ANDROID_HOME=${ANDROID_HOME:-}"
echo "ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-}"

if [ -z "${JAVA_HOME:-}" ]; then
  echo "[ko] JAVA_HOME non défini"
  fail=1
fi

SDK_PATH="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "${SDK_PATH}" ]; then
  echo "[ko] ANDROID_HOME / ANDROID_SDK_ROOT non défini"
  fail=1
else
  echo "[ok] SDK Android déclaré: ${SDK_PATH}"
  if [ -d "${SDK_PATH}" ]; then
    ls -1 "${SDK_PATH}" | sed 's/^/  - /' | head -n 20
  else
    echo "[ko] dossier SDK introuvable: ${SDK_PATH}"
    fail=1
  fi
fi

echo
echo "== Gradle wrapper =="
if [ -x "${ANDROID_DIR}/gradlew" ]; then
  echo "[ok] gradlew présent"
else
  echo "[ko] gradlew absent ou non exécutable"
  fail=1
fi

if [ "${fail}" -ne 0 ]; then
  echo
  echo "Diagnostic terminé avec erreurs."
  exit 1
fi

echo
echo "Diagnostic OK."
