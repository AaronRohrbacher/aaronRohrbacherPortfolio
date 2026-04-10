#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Loads .env.local into the current shell environment.
#
# Usage:  source scripts/setup-env.sh
# ──────────────────────────────────────────────────────────────────────────────

ENV_FILE=".env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "error: $ENV_FILE not found" >&2
  return 1 2>/dev/null || exit 1
fi

while IFS= read -r line; do
  # Skip comments and blank lines
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  export "$line"
done < "$ENV_FILE"

echo "Loaded env from $ENV_FILE"
