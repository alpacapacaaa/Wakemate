#!/usr/bin/env bash
# Rebuild the native app for the simulator and install it.
#
# Only needed after native changes — a new native dependency, an edit to modules/alarm-kit, or an
# app.json change that affects Info.plist/entitlements. Pure JS/TS edits are picked up by Metro
# and need nothing here.
#
# Override the device with:  SIM_DEVICE="iPhone 17" npm run build:sim
set -euo pipefail
cd "$(dirname "$0")/.."

DEVICE="${SIM_DEVICE:-iPhone 17 Pro}"

# `|| true` matters: with `set -e -o pipefail` a non-matching grep would abort the script here,
# before the friendly error below ever runs.
UDID="$(xcrun simctl list devices available \
  | grep -E "^[[:space:]]*${DEVICE} \(" \
  | tail -1 \
  | sed -E 's/.*\(([0-9A-Fa-f-]{36})\).*/\1/' || true)"

if [ -z "$UDID" ]; then
  echo "시뮬레이터를 찾을 수 없습니다: ${DEVICE}" >&2
  echo "사용 가능한 기기:" >&2
  xcrun simctl list devices available | grep -E "^[[:space:]]+iPhone" >&2
  exit 1
fi

echo "▸ pod install"
npx pod-install

echo "▸ build  (${DEVICE})"
xcodebuild \
  -workspace ios/app.xcworkspace \
  -scheme app \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "id=${UDID}" \
  -derivedDataPath ios/build \
  build

echo "▸ install"
xcrun simctl install "$UDID" ios/build/Build/Products/Debug-iphonesimulator/app.app

echo "완료. 'npm run sim' 으로 실행하세요."
