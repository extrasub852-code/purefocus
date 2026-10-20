#!/usr/bin/env bash
# Generates the Safari Web Extension Xcode project (macOS + iOS app wrappers)
# into safari/ from src/, and optionally builds it.
#
#   tools/build-safari.sh            generate safari/PureFocus/PureFocus.xcodeproj
#   tools/build-safari.sh --build    generate, then build the macOS app unsigned
#   tools/build-safari.sh --build-ios   generate, then build for the iOS simulator
#
# Requires full Xcode (not just Command Line Tools). The project references
# src/ directly (no --copy-resources), so edits in src/ are picked up by the
# next Xcode build without regenerating.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="PureFocus"
BUNDLE_ID="${PF_BUNDLE_ID:-com.extrasub852.purefocus}"
OUT="$ROOT/safari"
PROJECT="$OUT/$APP_NAME/$APP_NAME.xcodeproj"
DERIVED="$OUT/build"

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "safari-web-extension-converter not found. Install Xcode and run:" >&2
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
  exit 1
fi

cd "$ROOT"
xcrun safari-web-extension-converter src \
  --project-location "$OUT" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift \
  --no-open \
  --no-prompt \
  --force

echo "generated $PROJECT"

build() {
  local scheme="$1"; shift
  xcodebuild -project "$PROJECT" -scheme "$scheme" -configuration Debug \
    -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO "$@" build
}

for arg in "$@"; do
  case "$arg" in
    --build) build "$APP_NAME (macOS)" -destination 'generic/platform=macOS' ;;
    --build-ios) build "$APP_NAME (iOS)" -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
