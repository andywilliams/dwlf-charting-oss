#!/usr/bin/env bash
# Build, pack, and overlay the local @dwlf/charting into
# ~/development/portfolio-frontend so a CRA dev server picks up local OSS changes.
#
# Why this and not @andywilliams/dwlf-charting?
#   The private @andywilliams/dwlf-charting just does `export * from '@dwlf/charting'`
#   plus a few private extensions. The chart and all annotation rendering live
#   in @dwlf/charting (this OSS repo). Overlaying this tgz into portfolio-frontend's
#   node_modules replaces the published @dwlf/charting@1.4.1 with whatever you
#   built locally — the wildcard re-export then surfaces it.
#
# Usage: ./scripts/sync-to-portfolio-frontend.sh
set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$(cd "$LIB_DIR/../portfolio-frontend" && pwd)"

cd "$LIB_DIR"
echo "[1/3] Building @dwlf/charting..."
npm run build --silent

echo "[2/3] Packing tgz..."
TGZ_NAME="$(npm pack --silent | tail -n1)"
TGZ_PATH="$LIB_DIR/$TGZ_NAME"

echo "[3/3] Installing into $APP_DIR (overlays the published version)..."
cd "$APP_DIR"
npm install --no-save "$TGZ_PATH" --silent

# Critical: @andywilliams/dwlf-charting depends on @dwlf/charting@^1.4.1, but
# this local build's version is 0.0.0-development. npm refuses to dedupe across
# that mismatch and installs a *nested* copy of the published @dwlf/charting
# inside @andywilliams/dwlf-charting/node_modules. That nested copy then wins
# the import resolution from the private package, so our top-level overlay is
# silently ignored. Removing the nested copy forces resolution to fall back to
# the top-level (i.e. our local build).
NESTED="$APP_DIR/node_modules/@andywilliams/dwlf-charting/node_modules/@dwlf/charting"
if [ -d "$NESTED" ]; then
  rm -rf "$NESTED"
fi

echo "Done. Restart the CRA dev server if it's running."
