#!/bin/bash
# Phase 4 local accounting/GST proof. Synthetic data only; fresh SQLite; mock extraction; no external providers.
set -euo pipefail

export PATH="${HOME}/.local/ledger-bin:${HOME}/.local/node-v24.22.1-darwin-x64/bin:${PATH}"
unset OPENAI_API_KEY XAI_API_KEY

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)
FIXTURES="${ROOT}/api/src/modules/invoice-imports/__fixtures__"
TMP_DIR=$(mktemp -d)
DB_PATH="${TMP_DIR}/phase4.sqlite"
OBJECT_STORE_DIR="${TMP_DIR}/objects"
OWNER_JAR="${TMP_DIR}/owner.cookies"
READ_ONLY_JAR="${TMP_DIR}/read-only.cookies"
RESPONSE_BODY="${TMP_DIR}/response.json"
API_PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
BASE_URL="http://127.0.0.1:${API_PORT}"
SERVER_PID=''

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  if [[ "${exit_code}" -ne 0 && -f "${TMP_DIR}/server.log" ]]; then
    echo "server log tail:" >&2
    tail -n 120 "${TMP_DIR}/server.log" >&2
  fi
  rm -rf -- "${TMP_DIR}"
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

request() {
  local jar=$1 method=$2 path=$3 body=${4:-}
  local args=(-sS -X "${method}" -H 'Origin: http://localhost:8080' -b "${jar}" -c "${jar}" -o "${RESPONSE_BODY}" -w '%{http_code}' "${BASE_URL}${path}")
  if [[ -n "${body}" ]]; then args+=(-H 'Content-Type: application/json' --data-binary "${body}"); fi
  curl "${args[@]}"
}

expect_status() {
  local actual=$1 expected=$2 label=$3
  if [[ "${actual}" != "${expected}" ]]; then
    echo "${label}: expected HTTP ${expected}, got ${actual}" >&2
    jq -c . "${RESPONSE_BODY}" >&2 2>/dev/null || cat "${RESPONSE_BODY}" >&2
    exit 1
  fi
}

upload() {
  local jar=$1 name=$2 fixture=$3
  jq -n --arg filename "${name}" --arg content "$(base64 < "${FIXTURES}/${fixture}" | tr -d '\n')" \
    '{files:[{filename:$filename,contentType:"application/pdf",contentBase64:$content}]}' > "${TMP_DIR}/upload.json"
  local status
  status=$(request "${jar}" POST /api/invoice-imports "$(<"${TMP_DIR}/upload.json")")
  expect_status "${status}" 201 "upload ${name}"
  jq -r '.documents[0].id' "${RESPONSE_BODY}"
}

ledger_lines() {
  local reference_type=$1 reference_id=$2
  local status
  status=$(request "${OWNER_JAR}" GET '/api/reports/general-ledger?from=2026-10-01&to=2026-10-31&basis=accrual&baseCurrency=NZD')
  expect_status "${status}" 200 'general ledger'
  jq -c --arg type "${reference_type}" --arg id "${reference_id}" \
    '[.lines[] | select(.referenceType==$type and .referenceId==$id) | {accountCode:.accountNumber,debit,credit}]' "${RESPONSE_BODY}"
}

cd "${ROOT}"
echo "== Invoice import Phase 4 accounting/GST demo =="
echo "Node $(node --version); fresh temporary SQLite; APP_ENV=demo; OpenAI/xAI keys unset"
DATABASE_URL="${DB_PATH}" pnpm --filter @ledgercraft/api db:migrate >"${TMP_DIR}/migrate.log" 2>&1

BETTER_AUTH_SECRET=$(openssl rand -hex 32)
APP_ENV=demo DATABASE_URL="${DB_PATH}" API_HOST=127.0.0.1 API_PORT="${API_PORT}" \
OBJECT_STORE_DIR="${OBJECT_STORE_DIR}" BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET}" \
BETTER_AUTH_URL="${BASE_URL}" BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:8080,${BASE_URL}" \
pnpm --filter @ledgercraft/api start >"${TMP_DIR}/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 90); do
  if curl -fsS -o /dev/null "${BASE_URL}/api/healthz" 2>/dev/null; then break; fi
  sleep 1
done
curl -fsS -o /dev/null "${BASE_URL}/api/healthz"
echo "Local API ready on an ephemeral port"

OWNER_EMAIL="phase4-owner-$(date +%s)@example.test"
status=$(request "${OWNER_JAR}" POST /api/auth/sign-up/email "{\"name\":\"Crystal Touch Owner\",\"email\":\"${OWNER_EMAIL}\",\"password\":\"Local-phase4-demo-123!\"}")
expect_status "${status}" 200 'owner signup'
status=$(request "${OWNER_JAR}" PUT /api/business-profile '{"name":"Crystal Touch Cleaning","email":"owner@crystal.example.test","country":"NZ","defaultTaxRate":"15","gstRegistrationStatus":"registered","taxId":"111-222-333"}')
expect_status "${status}" 200 'business profile'
status=$(request "${OWNER_JAR}" GET /api/me); expect_status "${status}" 200 'owner profile'; ORGANISATION_ID=$(jq -r '.organisation.id' "${RESPONSE_BODY}")
status=$(request "${OWNER_JAR}" POST /api/customers '{"name":"Cleancorp Ltd","email":"accounts@cleancorp.example.test","country":"NZ"}'); expect_status "${status}" 201 'customer'; CUSTOMER_ID=$(jq -r .id "${RESPONSE_BODY}")
status=$(request "${OWNER_JAR}" POST /api/vendors '{"name":"Sparkle Supplies Ltd","email":"accounts@sparkle.example.test","taxId":"987-654-321"}'); expect_status "${status}" 201 'vendor'; VENDOR_ID=$(jq -r .id "${RESPONSE_BODY}")
status=$(request "${OWNER_JAR}" POST /api/accounts '{"name":"Operating Expenses","type":"expense","accountNumber":"5000","accountClass":"expense"}'); expect_status "${status}" 201 'expense account'; EXPENSE_ACCOUNT_ID=$(jq -r .id "${RESPONSE_BODY}")
echo "Organisation: Crystal Touch Cleaning (GST registered); synthetic customer/vendor created"

echo
echo "## 1. Cleancorp third-party-issued SALES import, draft then issue"
SALES_DOCUMENT_ID=$(upload "${OWNER_JAR}" cleancorp-phase4.pdf cleancorp-buyer-created-tax-invoice.pdf)
status=$(request "${OWNER_JAR}" POST "/api/invoice-imports/${SALES_DOCUMENT_ID}/extract" '{}'); expect_status "${status}" 200 'sales extract'
jq -c '{provider,mock,direction,suggestedDirection:.draft.suggestedDirection,net:.draft.net,gst:.draft.gst,total:.draft.total}' "${RESPONSE_BODY}"
status=$(request "${OWNER_JAR}" POST "/api/invoice-imports/${SALES_DOCUMENT_ID}/commit" '{}')
echo "commit before direction: HTTP ${status} $(jq -c '{code:.error.code,message:.error.message}' "${RESPONSE_BODY}")"
expect_status "${status}" 422 'commit before direction'
status=$(request "${OWNER_JAR}" PATCH "/api/invoice-imports/${SALES_DOCUMENT_ID}/draft" "{\"direction\":\"SALES\",\"thirdPartyIssued\":true,\"contactId\":\"${CUSTOMER_ID}\"}"); expect_status "${status}" 200 'sales review'
status=$(request "${OWNER_JAR}" POST "/api/invoice-imports/${SALES_DOCUMENT_ID}/commit" '{}'); expect_status "${status}" 201 'sales commit'; INVOICE_ID=$(jq -r .recordId "${RESPONSE_BODY}")
status=$(request "${OWNER_JAR}" GET "/api/invoices/${INVOICE_ID}"); expect_status "${status}" 200 'draft invoice'
jq -c '{status,paymentStatus,subtotal,taxAmount,total,totalPaid,balanceDue,thirdPartyIssued}' "${RESPONSE_BODY}"
echo "invoice journal after draft: $(ledger_lines invoice "${INVOICE_ID}")"
status=$(request "${OWNER_JAR}" PATCH "/api/invoices/${INVOICE_ID}" '{"status":"sent"}'); expect_status "${status}" 200 'issue invoice'
echo "invoice issue: HTTP ${status}, status=$(jq -r .status "${RESPONSE_BODY}")"
echo "invoice journal after issue: $(ledger_lines invoice "${INVOICE_ID}")"

echo
echo "## 2. Sparkle Supplies PURCHASE import, draft then receive"
PURCHASE_DOCUMENT_ID=$(upload "${OWNER_JAR}" sparkle-phase4.pdf sparkle-supplies-bill.pdf)
status=$(request "${OWNER_JAR}" POST "/api/invoice-imports/${PURCHASE_DOCUMENT_ID}/extract" '{}'); expect_status "${status}" 200 'purchase extract'
jq -c '{provider,mock,direction,suggestedDirection:.draft.suggestedDirection,net:.draft.net,gst:.draft.gst,total:.draft.total}' "${RESPONSE_BODY}"
status=$(request "${OWNER_JAR}" PATCH "/api/invoice-imports/${PURCHASE_DOCUMENT_ID}/draft" "{\"direction\":\"PURCHASE\",\"thirdPartyIssued\":false,\"contactId\":\"${VENDOR_ID}\"}"); expect_status "${status}" 200 'purchase review'
status=$(request "${OWNER_JAR}" POST "/api/invoice-imports/${PURCHASE_DOCUMENT_ID}/commit" '{}'); expect_status "${status}" 201 'purchase commit'; BILL_ID=$(jq -r .recordId "${RESPONSE_BODY}")
status=$(request "${OWNER_JAR}" GET "/api/bills/${BILL_ID}"); expect_status "${status}" 200 'draft bill'
jq -c '{lifecycleStatus,paymentStatus,subtotal,taxAmount,total,balanceDue}' "${RESPONSE_BODY}"
echo "bill journal after draft: $(ledger_lines bill "${BILL_ID}")"
status=$(request "${OWNER_JAR}" GET "/api/bills/${BILL_ID}"); expect_status "${status}" 200 'draft bill before classification'
jq -c --arg accountId "${EXPENSE_ACCOUNT_ID}" '{lines:[.lines[]|{description,quantity,unitPrice,taxRate,accountId:$accountId}]}' "${RESPONSE_BODY}" > "${TMP_DIR}/bill-patch.json"
status=$(request "${OWNER_JAR}" PATCH "/api/bills/${BILL_ID}" "$(<"${TMP_DIR}/bill-patch.json")"); expect_status "${status}" 200 'classify bill'
status=$(request "${OWNER_JAR}" POST "/api/bills/${BILL_ID}/receive" '{}'); expect_status "${status}" 200 'receive bill'
echo "bill receive: HTTP ${status}, lifecycleStatus=$(jq -r .lifecycleStatus "${RESPONSE_BODY}")"
echo "bill journal after receive: $(ledger_lines bill "${BILL_ID}")"

echo
echo "## 3-4. GST report (invoice basis) and trial balance"
status=$(request "${OWNER_JAR}" GET '/api/reports/financial?from=2026-10-01&to=2026-10-31&basis=accrual&baseCurrency=NZD'); expect_status "${status}" 200 'financial report'
jq -c '{gst:{basis:.taxSummary.basis,output:.taxSummary.outputGst,input:.taxSummary.inputGst,net:.taxSummary.netGst,position:.taxSummary.position},trialBalance:{totalDebits:.trialBalance.totalDebits,totalCredits:.trialBalance.totalCredits,balanced:.trialBalance.balanced}}' "${RESPONSE_BODY}"

echo
echo "## 5. Wrong direction requires an explicit PATCH"
FLIPPED_DOCUMENT_ID=$(upload "${OWNER_JAR}" cleancorp-flipped-phase4.pdf cleancorp-buyer-created-tax-invoice.pdf)
status=$(request "${OWNER_JAR}" POST "/api/invoice-imports/${FLIPPED_DOCUMENT_ID}/extract" '{}'); expect_status "${status}" 200 'flipped extract'
jq -c '{direction,suggestedDirection:.draft.suggestedDirection}' "${RESPONSE_BODY}"
status=$(request "${OWNER_JAR}" POST "/api/invoice-imports/${FLIPPED_DOCUMENT_ID}/commit" '{"acknowledgeDuplicates":true}')
echo "suggestion-only commit: HTTP ${status} $(jq -r .error.code "${RESPONSE_BODY}")"
expect_status "${status}" 422 'suggestion-only commit'
status=$(request "${OWNER_JAR}" PATCH "/api/invoice-imports/${FLIPPED_DOCUMENT_ID}/draft" "{\"direction\":\"PURCHASE\",\"contactId\":\"${VENDOR_ID}\"}"); expect_status "${status}" 200 'explicit direction flip'
jq -c '{explicitDirection:.direction,extractorSuggestion:.draft.suggestedDirection}' "${RESPONSE_BODY}"
status=$(request "${OWNER_JAR}" POST "/api/invoice-imports/${FLIPPED_DOCUMENT_ID}/commit" '{"acknowledgeDuplicates":true}'); expect_status "${status}" 201 'explicit flipped commit'; FLIPPED_BILL_ID=$(jq -r .recordId "${RESPONSE_BODY}")
jq -c '{recordType,recordId}' "${RESPONSE_BODY}"

echo
echo "## 6. Import commit cannot mark paid; normal payment route settles the invoice"
status=$(request "${OWNER_JAR}" GET "/api/invoices/${INVOICE_ID}"); expect_status "${status}" 200 'invoice before payment'
jq -c '{beforePayment:{status,paymentStatus,totalPaid,balanceDue}}' "${RESPONSE_BODY}"
status=$(request "${OWNER_JAR}" POST /api/payments "{\"invoiceId\":\"${INVOICE_ID}\",\"amount\":\"230.00\",\"paymentDate\":\"2026-10-25\",\"paymentMethod\":\"bank_transfer\",\"referenceNumber\":\"PHASE4-DEMO-PAYMENT\"}"); expect_status "${status}" 201 'invoice payment'; PAYMENT_ID=$(jq -r .id "${RESPONSE_BODY}")
echo "payment journal: $(ledger_lines invoice_payment "${PAYMENT_ID}")"
status=$(request "${OWNER_JAR}" GET "/api/invoices/${INVOICE_ID}"); expect_status "${status}" 200 'invoice after payment'
jq -c '{afterPayment:{status,paymentStatus,totalPaid,balanceDue}}' "${RESPONSE_BODY}"

echo
echo "## 7. read_only member permission denials"
READ_ONLY_EMAIL="phase4-read-only-$(date +%s)@example.test"
status=$(request "${OWNER_JAR}" POST "/api/organisations/${ORGANISATION_ID}/invitations" "{\"email\":\"${READ_ONLY_EMAIL}\",\"role\":\"read_only\"}"); expect_status "${status}" 201 'read-only invitation'; ACCEPT_TOKEN=$(jq -r .acceptToken "${RESPONSE_BODY}")
status=$(request "${READ_ONLY_JAR}" POST /api/auth/sign-up/email "{\"name\":\"Read Only Reviewer\",\"email\":\"${READ_ONLY_EMAIL}\",\"password\":\"Local-phase4-demo-123!\"}"); expect_status "${status}" 200 'read-only signup'
status=$(request "${READ_ONLY_JAR}" POST /api/invitations/accept "{\"token\":\"${ACCEPT_TOKEN}\"}"); expect_status "${status}" 200 'read-only invitation acceptance'
jq -n --arg content "$(base64 < "${FIXTURES}/sparkle-supplies-bill.pdf" | tr -d '\n')" '{files:[{filename:"denied.pdf",contentType:"application/pdf",contentBase64:$content}]}' > "${TMP_DIR}/denied-upload.json"
for scenario in \
  "upload|POST|/api/invoice-imports|$(<"${TMP_DIR}/denied-upload.json")" \
  "extract|POST|/api/invoice-imports/${FLIPPED_DOCUMENT_ID}/extract|{}" \
  "commit|POST|/api/invoice-imports/${FLIPPED_DOCUMENT_ID}/commit|{}" \
  "invoice issue|POST|/api/invoices/${INVOICE_ID}/send|{}" \
  "bill receive|POST|/api/bills/${FLIPPED_BILL_ID}/receive|{}"; do
  IFS='|' read -r label method path body <<<"${scenario}"
  status=$(request "${READ_ONLY_JAR}" "${method}" "${path}" "${body}")
  echo "${label}: HTTP ${status} $(jq -r .error.message "${RESPONSE_BODY}")"
  expect_status "${status}" 403 "read-only ${label}"
done

status=$(request "${OWNER_JAR}" GET '/api/reports/financial?from=2026-10-01&to=2026-10-31&basis=accrual&baseCurrency=NZD'); expect_status "${status}" 200 'final report'
echo "final trial balance: debits=$(jq -r .trialBalance.totalDebits "${RESPONSE_BODY}") credits=$(jq -r .trialBalance.totalCredits "${RESPONSE_BODY}") balanced=$(jq -r .trialBalance.balanced "${RESPONSE_BODY}")"
echo "Demo complete; the exit trap stops only PID ${SERVER_PID} and removes the temporary directory."
