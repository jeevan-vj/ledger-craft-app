#!/bin/bash
# Local Phase 3a browser proof for issue #94. Uses only synthetic demo data.
set -euo pipefail

export PATH="${HOME}/.local/node-v24.22.1-darwin-x64/bin:${HOME}/.local/ledger-bin:${PATH}"
unset OPENAI_API_KEY XAI_API_KEY

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
TMP_DIR=$(mktemp -d)
DB_PATH="${TMP_DIR}/phase3-web.sqlite"
OBJECT_STORE_DIR="${TMP_DIR}/objects"
API_PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
WEB_PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
API_PID=''
WEB_PID=''

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ -n "${WEB_PID}" ]]; then kill "${WEB_PID}" 2>/dev/null || true; wait "${WEB_PID}" 2>/dev/null || true; fi
  if [[ -n "${API_PID}" ]]; then kill "${API_PID}" 2>/dev/null || true; wait "${API_PID}" 2>/dev/null || true; fi
  for artifact in "${ROOT}"/vite.config.ts.timestamp-*.mjs; do
    [[ -e "${artifact}" ]] && rm -f -- "${artifact}"
  done
  rm -rf -- "${TMP_DIR}"
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local url=$1
  local log=$2
  for _ in $(seq 1 120); do
    if curl --fail --silent --output /dev/null "${url}" 2>/dev/null; then return 0; fi
    sleep 1
  done
  echo "Timed out waiting for ${url}" >&2
  sed -n '1,240p' "${log}" >&2
  return 1
}

cd "${ROOT}"
echo "Phase 3a invoice-import browser proof"
echo "Node: $(node --version) | pnpm: $(pnpm --version)"
echo "Fresh temporary SQLite; APP_ENV=demo; OpenAI and xAI keys unset"

DATABASE_URL="${DB_PATH}" pnpm --filter @ledgercraft/api db:migrate >"${TMP_DIR}/migrate.log" 2>&1

BETTER_AUTH_SECRET=$(openssl rand -hex 32)
APP_ENV=demo \
DATABASE_URL="${DB_PATH}" \
API_HOST=127.0.0.1 \
API_PORT="${API_PORT}" \
OBJECT_STORE_DIR="${OBJECT_STORE_DIR}" \
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET}" \
pnpm --filter @ledgercraft/api start >"${TMP_DIR}/api.log" 2>&1 &
API_PID=$!
wait_for_url "http://127.0.0.1:${API_PORT}/api/healthz" "${TMP_DIR}/api.log"

VITE_API_PROXY_TARGET="http://127.0.0.1:${API_PORT}" \
pnpm exec vite --host 127.0.0.1 --port "${WEB_PORT}" >"${TMP_DIR}/web.log" 2>&1 &
WEB_PID=$!
wait_for_url "http://127.0.0.1:${WEB_PORT}" "${TMP_DIR}/web.log"

PHASE3_WEB_URL="http://127.0.0.1:${WEB_PORT}" \
PHASE3_API_URL="http://127.0.0.1:${API_PORT}" \
PHASE3_OUTPUT_DIR="${ROOT}/docs/evidence/invoice-import/phase3-web" \
PHASE3_FIXTURE_DIR="${ROOT}/api/src/modules/invoice-imports/__fixtures__" \
node scripts/invoice-import-phase3-screens.mjs

expected=(
  01-upload-empty.png
  02-upload-drag.png
  03-processing.png
  04-review-original-beside-fields.png
  05-direction-third-party-warning.png
  06-low-confidence-photo.png
  07-duplicate-warning.png
  08-totals-mismatch-block.png
  09-committed-draft-invoice.png
  10-invoice-source-link.png
  11-bill-committed.png
  12-read-only-denied.png
)

for filename in "${expected[@]}"; do
  path="${ROOT}/docs/evidence/invoice-import/phase3-web/${filename}"
  [[ -f "${path}" ]] || { echo "Missing screenshot: ${filename}" >&2; exit 1; }
  bytes=$(stat -f '%z' "${path}")
  [[ "${bytes}" -lt 307200 ]] || { echo "Screenshot exceeds 300 KB: ${filename} (${bytes} bytes)" >&2; exit 1; }
  dimensions=$(sips -g pixelWidth -g pixelHeight "${path}" 2>/dev/null | awk '/pixelWidth:/{w=$2}/pixelHeight:/{h=$2}END{print w "x" h}')
  printf '%-42s %8s bytes  %s\n' "${filename}" "${bytes}" "${dimensions}"
done

echo "Browser proof completed. Servers stopped and temporary data removed by the exit trap."
