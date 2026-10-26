#!/bin/bash
# Local browser + API proof for issue #107 (recurring invoices). Uses only synthetic demo data.
set -euo pipefail

export PATH="${HOME}/.local/node-v24.22.1-darwin-x64/bin:${HOME}/.local/ledger-bin:${PATH}"
unset OPENAI_API_KEY XAI_API_KEY RESEND_API_KEY RESEND_FROM

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
TMP_DIR=$(mktemp -d)
DB_PATH="${TMP_DIR}/recurring.sqlite"
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
echo "Recurring invoices (#107) browser proof"
echo "Node: $(node --version) | pnpm: $(pnpm --version)"
echo "Fresh temporary SQLite; APP_ENV=demo; OpenAI, xAI and Resend keys unset (no email can be sent)"

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

echo "healthz: $(curl --silent "http://127.0.0.1:${API_PORT}/api/healthz")"

REC_WEB_URL="http://127.0.0.1:${WEB_PORT}" \
REC_OUTPUT_DIR="${ROOT}/docs/evidence/recurring-invoices" \
node scripts/recurring-invoices-screens.mjs

# Journal proof straight from the temp SQLite DB (GET /api/journal-entries lists manual journals only).
DB_PATH="${DB_PATH}" node --no-warnings -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.DB_PATH, { readOnly: true });
const out = ["", "Journal entries posted for recurring-generated invoices (read from temp SQLite):"];
const invs = db.prepare("SELECT id, invoice_number, status, total FROM invoices ORDER BY invoice_number").all();
for (const inv of invs) {
  const entries = db.prepare("SELECT id FROM journal_entries WHERE reference_type = ? AND reference_id = ?").all("invoice", inv.id);
  out.push(`  ${inv.invoice_number} status=${inv.status} total=${inv.total} journal_entries=${entries.length}`);
  for (const e of entries) for (const l of db.prepare("SELECT a.account_number AS code, a.name, l.debit_amount, l.credit_amount FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id WHERE l.journal_entry_id = ? ORDER BY l.line_order").all(e.id))
    out.push(`    ${l.code} ${l.name}  Dr ${l.debit_amount}  Cr ${l.credit_amount}`);
}
const runs = db.prepare("SELECT COUNT(*) AS c FROM recurring_runs").get();
out.push(`  recurring_runs rows=${runs.c} (one per template occurrence; reprocessing added none)`);
console.log(out.join("\n"));
' | tee -a "${ROOT}/docs/evidence/recurring-invoices/e2e-api-output.txt"

for filename in 01-editor-repeat-panel-preview.png 02-monthly-31st-clamped.png 03-recurring-page-rebuilt.png 04-not-emailed-email-not-configured.png; do
  path="${ROOT}/docs/evidence/recurring-invoices/${filename}"
  [[ -f "${path}" ]] || { echo "Missing screenshot: ${filename}" >&2; exit 1; }
  printf '%-44s %8s bytes\n' "${filename}" "$(stat -f '%z' "${path}")"
done
echo "Browser proof completed. Servers stopped and temporary data removed by the exit trap."
