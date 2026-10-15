#!/usr/bin/env bash
# Start local LedgerCraft: Postgres 55432, API 3001, Vite 8080.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  echo "Created .env from .env.example — edit BETTER_AUTH_SECRET (and any keys) if needed."
fi

echo "Starting Postgres on 55432…"
pnpm db:up

api_pid=""
cleanup() {
  if [[ -n "$api_pid" ]] && kill -0 "$api_pid" 2>/dev/null; then
    kill "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting API on 3001…"
pnpm dev:api &
api_pid=$!

for _ in $(seq 1 40); do
  if curl -sf http://127.0.0.1:3001/api/healthz >/dev/null; then
    break
  fi
  if ! kill -0 "$api_pid" 2>/dev/null; then
    echo "API exited before becoming healthy." >&2
    exit 1
  fi
  sleep 0.25
done

if ! curl -sf http://127.0.0.1:3001/api/healthz >/dev/null; then
  echo "API did not become healthy on http://127.0.0.1:3001/api/healthz" >&2
  exit 1
fi

echo "API http://127.0.0.1:3001"
echo "Web http://localhost:8080"
echo "Ctrl+C stops API + Vite. Postgres stays up (pnpm db:down to stop it)."

pnpm dev
