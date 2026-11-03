#!/bin/sh
# Standalone Android APK for Maestro. Not an EAS profile and not a release workflow.
# Requires the local Hono API on the host. The emulator reaches it at 10.0.2.2:3001.
set -eu
cd "$(dirname "$0")/.."
export E2E_BUILD=1
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://10.0.2.2:3001}"
export EXPO_NO_TELEMETRY=1
export SENTRY_DISABLE_AUTO_UPLOAD=true
# .env.local is gitignored. Expo inlines EXPO_PUBLIC_* from it at bundle time.
# A Metro cache from another build would keep the fallback 127.0.0.1 URL.
printf 'EXPO_PUBLIC_API_URL=%s\n' "$EXPO_PUBLIC_API_URL" > .env.local
rm -rf node_modules/.cache/metro android/app/build/generated/assets/createBundleReleaseJsAndAssets
rm -rf /tmp/metro-* "${TMPDIR:-/tmp}/metro-"* 2>/dev/null || true
if [ -z "${ANDROID_HOME:-}" ]; then
  echo "ANDROID_HOME is required" >&2
  exit 1
fi
npx expo prebuild --platform android --no-install
if [ -f android/gradle.properties ]; then
  # Emulator ABI only. android/ is generated and is not committed.
  if grep -q '^reactNativeArchitectures=' android/gradle.properties; then
    sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=x86_64/' android/gradle.properties
  else
    echo 'reactNativeArchitectures=x86_64' >> android/gradle.properties
  fi
fi
cd android
./gradlew assembleRelease --no-daemon --max-workers=2
echo "APK: $(pwd)/app/build/outputs/apk/release/app-release.apk"
