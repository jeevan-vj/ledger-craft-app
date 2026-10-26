#!/bin/bash
# Phase 0 local API demo: fresh temp SQLite, port 3017. Synthetic data only.
export PATH=~/.local/node-v24.22.1-darwin-x64/bin:~/.local/ledger-bin:$PATH
set -u
WT=~/.codex/worktrees/ledger-import-p0
TMP=$(mktemp -d <tmp>
DB=$TMP/demo.sqlite; JAR=$TMP/cookies.txt
B=http://127.0.0.1:3017
cd $WT
DATABASE_URL=$DB pnpm --filter @ledgercraft/api db:migrate > $TMP/migrate.log 2>&1 || { cat $TMP/migrate.log; exit 1; }
DATABASE_URL=$DB API_PORT=3017 API_HOST=127.0.0.1 BETTER_AUTH_SECRET=$(openssl rand -hex 32) \
  pnpm --filter @ledgercraft/api start > $TMP/server.log 2>&1 &
SP=$!
for i in $(seq 1 60); do curl -s -o /dev/null $B/api/healthz 2>/dev/null && break; curl -s -o /dev/null $B/ && break; sleep 1; done
H=(-H 'Content-Type: application/json' -H 'Origin: http://localhost:8080' -b $JAR -c $JAR)
c() { # method path [body]
  local m=$1 p=$2 d=${3:-}
  echo "\$ curl -X $m $p ${d:+-d '$d'}"
  if [ -n "$d" ]; then curl -s -X $m "${H[@]}" -H "Idempotency-Key: $(uuidgen)" -w '\n-> HTTP %{http_code}\n' "$B$p" -d "$d"
  else curl -s -X $m "${H[@]}" -w '\n-> HTTP %{http_code}\n' "$B$p"; fi
}
st() { curl -s -o /dev/null -w '%{http_code}' -X $1 "${H[@]}" "$B$2" ${3:+-d "$3"}; }
echo "== Phase 0 demo $(date '+%Y-%m-%d %H:%M %Z') | commit $(git rev-parse --short HEAD) | fresh SQLite in temp dir | port 3017 =="
NT=$(sqlite3 $DB "select count(*) from sqlite_master where type='table';"); EC=$(sqlite3 $DB "select count(*) from pragma_table_info('invoices') where name='external_number';"); AR=$(sqlite3 $DB "select count(*) from pragma_table_info('invoice_attachments') where name in ('role','locked');")
echo "migrations applied (db:migrate incl. 0017): $NT tables; invoices.external_number present=$EC; invoice_attachments role/locked cols=$AR"
echo; echo "## Setup (owner signs up; synthetic org)"
c POST /api/auth/sign-up/email '{"name":"Demo Owner","email":"owner-'$RANDOM'@example.test","password":"Local-demo-pass-123!"}' | sed -E 's/"token":"[^"]+"/"token":"<redacted>"/g'
c PUT /api/business-profile '{"name":"Phase0 Demo Ltd","email":"owner@example.test","country":"NZ","defaultTaxRate":"15","gstRegistrationStatus":"registered"}' | tail -1
CUST=$(curl -s -X POST "${H[@]}" $B/api/customers -d '{"name":"Harbour Cafe","email":"a@harbour.example","country":"NZ"}' | jq -r .id)
echo "customer id: $CUST"
UID_=$(sqlite3 $DB "select user_id from organisation_memberships limit 1;")
role() { sqlite3 $DB "update organisation_memberships set role='$1' where user_id='$UID_';"; echo; echo "## Membership role set to: $(sqlite3 $DB "select role from organisation_memberships where user_id='$UID_';")"; }
IMP='{"dryRun":false,"rows":[{"externalId":"legacy-INV-1001","invoiceNumber":"LEGACY-1001","customerId":"'$CUST'","date":"2026-10-05","dueDate":"2026-10-20","currency":"NZD","taxInclusive":false,"taxRate":"15","status":"paid","paymentDate":"2026-10-10","paymentMethod":"bank_transfer","paymentReference":"LEG-PAY-1001","items":[{"description":"Consulting","quantity":"1","rate":"200.00"}]}]}'
routes() {
  printf '%-7s %-36s %s\n' METHOD PATH STATUS
  printf '%-7s %-36s %s\n' POST /api/invoices-import "$(st POST /api/invoices-import '{"dryRun":true,"rows":[{"externalId":"probe","customerId":"'$CUST'","date":"2026-10-05","dueDate":"2026-10-20","items":[{"description":"x","quantity":"1","rate":"1"}]}]}')"
  for p in /api/invoices-export.csv /api/bills-export.csv /api/vendors-export.csv /api/bank-transactions/export.csv; do printf '%-7s %-36s %s\n' GET $p "$(st GET $p)"; done
  printf '%-7s %-36s %s\n' POST /api/ai/receipt-scan "$(st POST /api/ai/receipt-scan '{"imageBase64":"abc"}')"
  printf '%-7s %-36s %s\n' POST /api/ai/chat "$(st POST /api/ai/chat '{"messages":[{"role":"user","content":"hi"}]}')"
}
role read_only; routes
echo; echo "read_only body sample:"; c POST /api/invoices-import "$IMP"
role accountant; routes
echo "(AI routes pass the permission check for accountant; 503 = no AI key configured locally, by design no key used)"
echo; echo "## Accountant imports a PAID legacy invoice"
c POST /api/invoices-import "$IMP"
INV=$(sqlite3 $DB "select id from invoices where external_number='LEGACY-1001';")
echo; echo "## Invoice row (DB):"; sqlite3 -header -column $DB "select invoice_number, external_number, status, subtotal, tax_amount, total from invoices where id='$INV';"
echo; echo "## Payment created:"; c GET "/api/payments" | jq -c '(.payments // .items // .)[]? | {invoiceId, amount, paymentDate, paymentMethod, referenceNumber}' 2>/dev/null
sqlite3 -header -column $DB "select amount, payment_date, payment_method from payments where invoice_id='$INV';"
echo; echo "## Journal lines for this invoice + payment (DB):"
sqlite3 -header -column $DB "select je.reference_type as ref, a.account_number as code, a.name, jl.debit_amount as debit, jl.credit_amount as credit from journal_entry_lines jl join journal_entries je on je.id=jl.journal_entry_id join accounts a on a.id=jl.account_id where je.organisation_id=(select organisation_id from invoices where id='$INV') order by je.entry_number, jl.line_order;" 2>&1
echo; echo "## Balance check per journal entry:"
sqlite3 -header -column $DB "select je.reference_type as ref, sum(jl.debit_amount) dr, sum(jl.credit_amount) cr, case when abs(sum(jl.debit_amount)-sum(jl.credit_amount))<0.005 then 'BALANCED' else 'UNBALANCED' end ok from journal_entry_lines jl join journal_entries je on je.id=jl.journal_entry_id where je.organisation_id=(select organisation_id from invoices where id='$INV') group by je.id;" 2>&1
echo; echo "## Export CSV includes externalNumber:"; curl -s "${H[@]}" $B/api/invoices-export.csv | head -2
echo; echo "## Source-document attachment cannot be deleted (owner role)"
role owner
ORG=$(sqlite3 $DB "select organisation_id from invoices where id='$INV';")
sqlite3 $DB "insert into invoice_attachments (id, organisation_id, invoice_id, object_key, filename, content_type, size, created_by, role, locked) values ('att-src-1','$ORG','$INV','demo/src.pdf','original.pdf','application/pdf',10,'$UID_','source_document',1);"
c DELETE /api/invoices/$INV/attachments/att-src-1
sqlite3 $DB "select 'still present: '||count(*) from invoice_attachments where id='att-src-1';"
kill $SP 2>/dev/null; sleep 1; pkill -f "API_PORT=3017" 2>/dev/null; lsof -ti tcp:3017 | xargs kill 2>/dev/null
echo; echo "server stopped; temp dir removed"
cp $TMP/server.log ~/p0-demo-server.log
rm -rf $TMP
