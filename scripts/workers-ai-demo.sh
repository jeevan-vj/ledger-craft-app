#!/bin/bash
# Local Workers AI review-screen proof. Synthetic demo data only; fake AI binding (WORKERS_AI_FAKE=1), no network AI.
set -euo pipefail
export PATH="${HOME}/.local/node-v24.22.1-darwin-x64/bin:${HOME}/.local/ledger-bin:${PATH}"
unset OPENAI_API_KEY XAI_API_KEY
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
TMP_DIR=$(mktemp -d)
DB_PATH="${TMP_DIR}/wai.sqlite"
API_PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
WEB_PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
API_PID=''; WEB_PID=''
cleanup() { local c=$?; trap - EXIT INT TERM
  if [[ $c -ne 0 && -f "${TMP_DIR}/api.log" ]]; then echo "--- api.log (tail) ---" >&2; tail -n 60 "${TMP_DIR}/api.log" >&2; fi
  [[ -n "${WEB_PID}" ]] && { kill "${WEB_PID}" 2>/dev/null || true; }
  [[ -n "${API_PID}" ]] && { kill "${API_PID}" 2>/dev/null || true; }
  for a in "${ROOT}"/vite.config.ts.timestamp-*.mjs; do [[ -e "$a" ]] && rm -f -- "$a"; done
  rm -rf -- "${TMP_DIR}"; exit $c; }
trap cleanup EXIT INT TERM
wait_for_url() { for _ in $(seq 1 120); do curl -fs -o /dev/null "$1" && return 0; sleep 1; done; echo "timeout $1" >&2; sed -n '1,200p' "$2" >&2; return 1; }
cd "${ROOT}"
DATABASE_URL="${DB_PATH}" pnpm --filter @ledgercraft/api db:migrate >"${TMP_DIR}/migrate.log" 2>&1
APP_ENV=demo WORKERS_AI_FAKE=1 INVOICE_IMPORT_AI_PROVIDER=workers-ai \
DATABASE_URL="${DB_PATH}" API_HOST=127.0.0.1 API_PORT="${API_PORT}" OBJECT_STORE_DIR="${TMP_DIR}/objects" \
BETTER_AUTH_SECRET=$(openssl rand -hex 32) \
pnpm --filter @ledgercraft/api start >"${TMP_DIR}/api.log" 2>&1 &
API_PID=$!
wait_for_url "http://127.0.0.1:${API_PORT}/api/healthz" "${TMP_DIR}/api.log"
VITE_API_PROXY_TARGET="http://127.0.0.1:${API_PORT}" pnpm exec vite --host 127.0.0.1 --port "${WEB_PORT}" >"${TMP_DIR}/web.log" 2>&1 &
WEB_PID=$!
wait_for_url "http://127.0.0.1:${WEB_PORT}" "${TMP_DIR}/web.log"
WAI_WEB_URL="http://127.0.0.1:${WEB_PORT}" WAI_OUTPUT_DIR="${ROOT}/docs/evidence/workers-ai" \
WAI_FIXTURE="${ROOT}/docs/evidence/workers-ai/fixtures/inv1-kiwi-supplies.png" \
node scripts/workers-ai-screens.mjs
echo "done; servers stopped and temp data removed"
