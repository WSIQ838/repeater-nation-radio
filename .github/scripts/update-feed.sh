#!/usr/bin/env bash
# Publishes one platform's entry of the in-app update feed: a small JSON file on the
# "radio-updates" release that the app's updater reads (see plugins.updater in
# src-tauri/tauri.conf.json). Usage: update-feed.sh <target-arch> <signature file> <download url>
# Runs only when the build was signed (TAURI_SIGNING_PRIVATE_KEY secret is set).
set -euo pipefail
NAME="$1"; SIG_FILE="$2"; URL="$3"
VERSION=$(node -p "require('./package.json').version")
FEED_TAG="radio-updates"
# A pre-release that is never marked latest, so the website's download link and the
# release list keep pointing at the real versions.
gh release view "$FEED_TAG" >/dev/null 2>&1 || \
  gh release create "$FEED_TAG" --prerelease --latest=false --title "Radio update feed" \
    --notes "Files the Repeater Nation Radio app reads to update itself. Download the app from the radio-v… releases instead." || true
SIG_FILE="$SIG_FILE" URL="$URL" VERSION="$VERSION" OUT="$NAME.json" node -e '
  const fs = require("fs");
  fs.writeFileSync(process.env.OUT, JSON.stringify({
    version: process.env.VERSION,
    notes: "Repeater Nation Radio " + process.env.VERSION,
    pub_date: new Date().toISOString(),
    url: process.env.URL,
    signature: fs.readFileSync(process.env.SIG_FILE, "utf8").trim(),
  }, null, 2));'
gh release upload "$FEED_TAG" "$NAME.json" --clobber
echo "Update feed $NAME.json -> $VERSION ($URL)"
