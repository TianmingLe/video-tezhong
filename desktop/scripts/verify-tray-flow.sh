#!/usr/bin/env bash
set -euo pipefail

echo "[verify-tray] start"

cd "$(dirname "$0")/.."

export ELECTRON_SKIP_BINARY_DOWNLOAD=1

VITEST="./node_modules/.bin/vitest"
if [[ ! -x "$VITEST" ]]; then
  echo "[verify-tray] vitest not found at $VITEST"
  echo "[verify-tray] hint: run 'cd desktop && npm ci' first"
  exit 1
fi

TARGET_TEST="electron/main/notify/notifyFlow.test.ts"
if [[ -f "$TARGET_TEST" ]]; then
  echo "[verify-tray] run notifyFlow integration test"
  "$VITEST" run "$TARGET_TEST"
else
  echo "[verify-tray] notifyFlow test not found"
  exit 1
fi

echo "[verify-tray] done"
