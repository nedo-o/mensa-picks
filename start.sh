#!/bin/sh
# Starter für Linux und macOS: startet den Server und öffnet den Browser.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Bitte von https://nodejs.org installieren (LTS-Version) und nochmal starten."
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
  echo "Node.js ist zu alt ($(node -v)). Bitte Version 20 oder neuer von https://nodejs.org installieren."
  exit 1
fi
exec node server.js --open
