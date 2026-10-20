#!/usr/bin/env bash
# Safari Web Extension wrapper (macOS + iOS apps) for src/, kept in safari/.
#
#   tools/build-safari.sh               generate safari/PureFocus/PureFocus.xcodeproj if missing
#   tools/build-safari.sh --regenerate  re-run the converter, overwriting safari/
#   tools/build-safari.sh --build       build the macOS app (ad-hoc signed) into safari/build/
#   tools/build-safari.sh --build-ios   build the iOS app for the simulator, unsigned
#
# Requires full Xcode (not just Command Line Tools). The project references
# src/ by relative path (no --copy-resources), and src/'s subfolders are folder
# references, so edits in src/ are picked up by the next build. Only a new
# top-level file in src/ needs --regenerate.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="PureFocus"
BUNDLE_ID="${PF_BUNDLE_ID:-com.extrasub852.purefocus}"
OUT="$ROOT/safari"
PROJECT="$OUT/$APP_NAME/$APP_NAME.xcodeproj"
DERIVED="$OUT/build"

generate() {
  if ! xcrun --find safari-web-extension-converter >/dev/null; then
    echo "safari-web-extension-converter unavailable. Install Xcode, then run:" >&2
    echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
    echo "  sudo xcodebuild -license accept" >&2
    exit 1
  fi
  (cd "$ROOT" && xcrun safari-web-extension-converter src \
    --project-location "$OUT" \
    --app-name "$APP_NAME" \
    --bundle-identifier "$BUNDLE_ID" \
    --swift \
    --no-open \
    --no-prompt \
    --force)
  echo "generated $PROJECT"
}

build() {
  local scheme="$1"; shift
  xcodebuild -project "$PROJECT" -scheme "$scheme" -configuration Debug \
    -derivedDataPath "$DERIVED" "$@" build
}

# Ad-hoc ("Sign to Run Locally") needs no Apple account or certificate, and
# unlike a fully unsigned build the app can be launched to register the
# extension with Safari.
MAC_SIGNING=(CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=)

if [[ " $* " == *" --regenerate "* ]]; then
  generate
elif [[ ! -d "$PROJECT" ]]; then
  generate
elif [[ $# -eq 0 ]]; then
  echo "$PROJECT already exists (use --regenerate to overwrite)"
fi

for arg in "$@"; do
  case "$arg" in
    --regenerate) ;;
    --build) build "$APP_NAME (macOS)" -destination 'generic/platform=macOS' "${MAC_SIGNING[@]}" ;;
    --build-ios) build "$APP_NAME (iOS)" -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
