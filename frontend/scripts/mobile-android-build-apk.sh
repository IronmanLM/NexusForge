#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="${ROOT_DIR}/android"
BUILD_TYPE="${1:-debug}"
source "${ROOT_DIR}/scripts/mobile-android-env.sh"

has_release_signing() {
  if [ -n "${NEXUSFORGE_ANDROID_KEYSTORE_PATH:-}" ] \
    && [ -n "${NEXUSFORGE_ANDROID_KEYSTORE_PASSWORD:-}" ] \
    && [ -n "${NEXUSFORGE_ANDROID_KEY_ALIAS:-}" ] \
    && [ -n "${NEXUSFORGE_ANDROID_KEY_PASSWORD:-}" ]; then
    return 0
  fi

  local key_properties="${ROOT_DIR}/android/key.properties"
  if [ -f "${key_properties}" ] \
    && grep -q '^storeFile=' "${key_properties}" \
    && grep -q '^storePassword=' "${key_properties}" \
    && grep -q '^keyAlias=' "${key_properties}" \
    && grep -q '^keyPassword=' "${key_properties}"; then
    return 0
  fi

  return 1
}

case "${BUILD_TYPE}" in
  debug|release|bundle) ;;
  *)
    echo "Usage: $(basename "$0") [debug|release|bundle]" >&2
    exit 1
    ;;
esac

if ! command -v java >/dev/null 2>&1; then
  echo "java est requis pour construire l APK Android." >&2
  exit 1
fi

if [ -z "${JAVA_HOME:-}" ]; then
  echo "JAVA_HOME doit être défini avant de lancer le build Android." >&2
  exit 1
fi

if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  echo "ANDROID_HOME ou ANDROID_SDK_ROOT doit être défini avant de lancer le build Android." >&2
  exit 1
fi

if [ "${BUILD_TYPE}" = "release" ] || [ "${BUILD_TYPE}" = "bundle" ]; then
  if ! has_release_signing; then
    echo "La signature release Android n est pas configurée." >&2
    echo "Ajoute frontend/android/key.properties a partir de key.properties.example" >&2
    echo "ou définis NEXUSFORGE_ANDROID_KEYSTORE_PATH / PASSWORD / ALIAS / KEY_PASSWORD." >&2
    exit 1
  fi
fi

cd "${ROOT_DIR}"
npm run mobile:build

cd "${ANDROID_DIR}"
if [ "${BUILD_TYPE}" = "bundle" ]; then
  ./gradlew bundleRelease
  echo "AAB généré: ${ANDROID_DIR}/app/build/outputs/bundle/release/app-release.aab"
elif [ "${BUILD_TYPE}" = "release" ]; then
  ./gradlew assembleRelease
  echo "APK généré: ${ANDROID_DIR}/app/build/outputs/apk/release/app-release.apk"
else
  ./gradlew assembleDebug
  echo "APK généré: ${ANDROID_DIR}/app/build/outputs/apk/debug/app-debug.apk"
fi
