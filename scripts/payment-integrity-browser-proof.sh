#!/bin/bash
# Local web + API proof for invoice instalments and payment reversals. Synthetic data only.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
TMP_DIR=$(mktemp -d)
DB_PATH="${TMP_DIR}/payment-integrity.sqlite"
API_PORT=3211
WEB_PORT=8181
PAYMENT_PROOF_PASSWORD=$(openssl rand -hex 24)
OUTPUT_DIR="${ROOT}/docs/evidence/payment-integrity"
API_PID=''
WEB_PID=''

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ -n "${WEB_PID}" ]]; then kill "${WEB_PID}" 2>/dev/null || true; wait "${WEB_PID}" 2>/dev/null || true; fi
  if [[ -n "${API_PID}" ]]; then kill "${API_PID}" 2>/dev/null || true; wait "${API_PID}" 2>/dev/null || true; fi
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
  sed -n '1,240p' "${log}" >&2
  return 1
}

cd "${ROOT}"
DATABASE_URL="${DB_PATH}" pnpm --filter @ledgercraft/api db:migrate >"${TMP_DIR}/migrate.log" 2>&1

APP_ENV=demo DATABASE_URL="${DB_PATH}" API_HOST=127.0.0.1 API_PORT="${API_PORT}" \
  OBJECT_STORE_DIR="${TMP_DIR}/objects" BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  pnpm --filter @ledgercraft/api start >"${TMP_DIR}/api.log" 2>&1 &
API_PID=$!
wait_for_url "http://127.0.0.1:${API_PORT}/api/healthz" "${TMP_DIR}/api.log"

VITE_API_PROXY_TARGET="http://127.0.0.1:${API_PORT}" \
  pnpm exec vite --host 127.0.0.1 --port "${WEB_PORT}" >"${TMP_DIR}/web.log" 2>&1 &
WEB_PID=$!
wait_for_url "http://127.0.0.1:${WEB_PORT}" "${TMP_DIR}/web.log"

PAYMENT_WEB_URL="http://127.0.0.1:${WEB_PORT}" PAYMENT_OUTPUT_DIR="${OUTPUT_DIR}" \
  PAYMENT_PROOF_PASSWORD="${PAYMENT_PROOF_PASSWORD}" \
  node scripts/payment-integrity-screens.mjs

DB_PATH="${DB_PATH}" node --no-warnings -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.DB_PATH, { readOnly: true });
const payment = db.prepare("SELECT id, amount, status, reversal_reason, reversal_date FROM payments WHERE reference_number = ?").get("REF-REV-1");
const source = db.prepare("SELECT id, status FROM journal_entries WHERE reference_type = ? AND reference_id = ?").get("invoice_payment", payment.id);
const reversal = db.prepare("SELECT id, status FROM journal_entries WHERE reference_type = ? AND reference_id = ?").get("invoice_payment_reversal", source.id);
const invoice = db.prepare("SELECT invoice_number, total, total_paid, balance_due, payment_status FROM invoices LIMIT 1").get();
const lines = db.prepare("SELECT debit_amount, credit_amount FROM journal_entry_lines WHERE journal_entry_id = ?").all(reversal.id);
const debit = lines.reduce((sum, line) => sum + Number(line.debit_amount), 0).toFixed(2);
const credit = lines.reduce((sum, line) => sum + Number(line.credit_amount), 0).toFixed(2);
console.log(`invoice ${invoice.invoice_number}: total=${invoice.total} paid=${invoice.total_paid} balance=${invoice.balance_due} status=${invoice.payment_status}`);
console.log(`source payment: amount=${payment.amount} status=${payment.status} reason=${JSON.stringify(payment.reversal_reason)} date=${payment.reversal_date}`);
console.log(`source journal status=${source.status}; reversal journal status=${reversal.status}; debit=${debit}; credit=${credit}`);
' | tee -a "${OUTPUT_DIR}/e2e-api-output.txt"

echo "Payment integrity browser proof completed."
