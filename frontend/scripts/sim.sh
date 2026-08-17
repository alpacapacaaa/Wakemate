#!/usr/bin/env bash
# Boot the simulator and launch the app on it.
#
# `npx expo run:ios` is not usable in this project: it resolves the simulator correctly and then
# still treats it as a physical device, failing with "No code signing certificates are available".
# These scripts drive xcodebuild/simctl directly, which works.
#
# Override the device with:  SIM_DEVICE="iPhone 17" npm run sim
set -euo pipefail
cd "$(dirname "$0")/.."

DEVICE="${SIM_DEVICE:-iPhone 17 Pro}"
BUNDLE_ID="$(node -p "require('./app.json').expo.ios.bundleIdentifier")"

# Simulators are listed oldest-runtime first, so the last match is the newest iOS that has this
# device. AlarmKit needs iOS 26+, so newest is what we want.
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

echo "▸ ${DEVICE}  (${UDID})"

if ! xcrun simctl list devices booted | grep -q "$UDID"; then
  xcrun simctl boot "$UDID"
fi
open -a Simulator

if ! curl -s --max-time 2 http://127.0.0.1:8081/status > /dev/null 2>&1; then
  echo "⚠︎ Metro가 8081에 없습니다. 다른 터미널에서 'npm run dev'를 먼저 실행하세요." >&2
  exit 1
fi

# Point the dev client at localhost explicitly instead of letting it reuse whatever URL it cached.
# Expo can guess a LAN address that does not resolve (we saw it pick 192.0.0.2), and the app then
# fails with "Failed to load app from ...". The simulator shares the Mac's network stack, so
# 127.0.0.1 is always the right answer here.
SCHEME="$(node -p "require('./app.json').expo.scheme")"
xcrun simctl launch "$UDID" "$BUNDLE_ID" > /dev/null
xcrun simctl openurl "$UDID" "${SCHEME}://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
echo "앱을 열었습니다."
