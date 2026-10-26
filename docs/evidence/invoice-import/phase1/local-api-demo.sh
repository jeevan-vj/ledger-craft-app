#!/bin/bash
# Phase 1 local API demo: fresh temp SQLite, port 3018. Synthetic data only (Crystal Touch Cleaning / Cleancorp).
export PATH=~/.local/node-v24.22.1-darwin-x64/bin:~/.local/ledger-bin:$PATH
set -u
WT=~/.codex/worktrees/ledger-import-p1
FX=$WT/api/src/modules/invoice-imports/__fixtures__
TMP=$(mktemp -d)
DB=$TMP/demo.sqlite; JA=$TMP/a.txt; JB=$TMP/b.txt
B=http://127.0.0.1:3018
cd $WT
DATABASE_URL=$DB pnpm --filter @ledgercraft/api db:migrate > $TMP/migrate.log 2>&1 || { cat $TMP/migrate.log; exit 1; }
DATABASE_URL=$DB API_PORT=3018 API_HOST=127.0.0.1 OBJECT_STORE_DIR=$TMP/objects BETTER_AUTH_SECRET=$(openssl rand -hex 32) \
  pnpm --filter @ledgercraft/api start > $TMP/server.log 2>&1 &
SP=$!
for i in $(seq 1 90); do curl -s -o /dev/null $B/api/healthz 2>/dev/null && break; sleep 1; done
HDR=(-H "Content-Type: application/json" -H "Origin: http://localhost:8080")
red() { sed -E 's/"token":"[^"]+"/"token":"<redacted>"/g; s#/Users/[^/" ]+#~#g; s/"contentBase64":"[^"]{20}[^"]*"/"contentBase64":"<...>"/g'; }
req() { # jar method path [bodyfile]
  local j=$1 m=$2 p=$3 f=${4:-}
  echo "\$ curl -X $m $p ${f:+--data @$(basename $f)}"
  if [ -n "$f" ]; then curl -s -X $m "${HDR[@]}" -b $j -c $j -H "Idempotency-Key: $(uuidgen)" -w '\n-> HTTP %{http_code}\n' "$B$p" --data-binary @$f | red
  else curl -s -X $m "${HDR[@]}" -b $j -c $j -w '\n-> HTTP %{http_code}\n' "$B$p" | red; fi
}
up() { # name file ctype -> body file
  printf '{"files":[{"filename":"%s","contentType":"%s","contentBase64":"%s"}]}' "$1" "$3" "$(base64 < $2 | tr -d '\n')" > $TMP/$4
}
echo "== Phase 1 demo $(date '+%Y-%m-%d %H:%M %Z') | commit $(git rev-parse --short HEAD) | fresh SQLite in temp dir | port 3018 =="
echo "tables: $(sqlite3 $DB "select group_concat(name) from sqlite_master where type='table' and name like 'import_%';")"
echo "invoices import cols: $(sqlite3 $DB "select group_concat(name) from pragma_table_info('invoices') where name in ('source','external_issuer_name','external_number','import_document_id');")"
echo "bills import cols: $(sqlite3 $DB "select group_concat(name) from pragma_table_info('bills') where name in ('source','external_issuer_name','external_number','import_document_id');")"
echo; echo "## Setup: org A 'Crystal Touch Cleaning' owner, org B 'Other Demo Org' owner (synthetic)"
req $JA POST /api/auth/sign-up/email <(echo '{"name":"Crystal Owner","email":"ct-'$RANDOM'@example.test","password":"Local-demo-pass-123!"}') | tail -1
curl -s -o /dev/null -X PUT "${HDR[@]}" -b $JA -c $JA $B/api/business-profile -d '{"name":"Crystal Touch Cleaning","email":"owner@crystal.example","country":"NZ","defaultTaxRate":"15","gstRegistrationStatus":"registered"}'
req $JB POST /api/auth/sign-up/email <(echo '{"name":"Other Owner","email":"ob-'$RANDOM'@example.test","password":"Local-demo-pass-123!"}') | tail -1
curl -s -o /dev/null -X PUT "${HDR[@]}" -b $JB -c $JB $B/api/business-profile -d '{"name":"Other Demo Org","email":"owner@other.example","country":"NZ","defaultTaxRate":"15","gstRegistrationStatus":"registered"}'
UA=$(sqlite3 $DB "select user_id from organisation_memberships order by rowid limit 1;")
echo; echo "## 1. Upload Cleancorp PDF (org A owner)"
up cleancorp-buyer-created-tax-invoice.pdf $FX/cleancorp-buyer-created-tax-invoice.pdf application/pdf pdf.json
req $JA POST /api/invoice-imports $TMP/pdf.json > $TMP/r1.txt; sed -n 2p $TMP/r1.txt | jq -c '{documents:[.documents[]?|{id,status,originalFilename,mimeType,sizeBytes,sha256}],duplicateWarnings}' 2>/dev/null; tail -1 $TMP/r1.txt
DOC=$(sed -n 2p $TMP/r1.txt | jq -r '.documents[0].id' 2>/dev/null)
echo "pdf doc id: $DOC"
echo; echo "## 2. Upload photo-style JPG (org A owner)"
up "../../invoice photo.jpg" $FX/invoice-photo.jpg image/jpeg jpg.json
req $JA POST /api/invoice-imports $TMP/jpg.json > $TMP/r2.txt; sed -n 2p $TMP/r2.txt | jq -c '{documents:[.documents[]?|{id,status,originalFilename,mimeType,sizeBytes}],duplicateWarnings}' 2>/dev/null; tail -1 $TMP/r2.txt
echo; echo "## 3. Duplicate upload of same PDF -> accepted with warning"
req $JA POST /api/invoice-imports $TMP/pdf.json > $TMP/r3.txt; sed -n 2p $TMP/r3.txt | jq -c '{documents:[.documents[]?|{id,duplicateOfDocumentId}],duplicateWarnings}' 2>/dev/null; tail -1 $TMP/r3.txt
echo; echo "## 4. Bad file: plain text declared as application/pdf"
printf 'hello, not a pdf' > $TMP/fake.pdf; up fake.pdf $TMP/fake.pdf application/pdf bad.json
req $JA POST /api/invoice-imports $TMP/bad.json
echo; echo "## 5. Oversize: 1.2 MB file with PDF header"
{ printf '%%PDF-1.4\n'; head -c 1250000 /dev/zero; } > $TMP/big.pdf; up big.pdf $TMP/big.pdf application/pdf big.json
req $JA POST /api/invoice-imports $TMP/big.json | tail -c 300
echo; echo "## 6. Download as org A owner"
curl -s -D $TMP/h.txt -o $TMP/dl.pdf "${HDR[@]}" -b $JA -c $JA $B/api/invoice-imports/$DOC/file
grep -iE '^(HTTP|content-type|content-disposition|cache-control|x-content-type-options)' $TMP/h.txt
echo "sha256 match: $( [ "$(shasum -a 256 < $TMP/dl.pdf | cut -d' ' -f1)" = "$(shasum -a 256 < $FX/cleancorp-buyer-created-tax-invoice.pdf | cut -d' ' -f1)" ] && echo yes || echo NO)"
echo; echo "## 7. Org B owner tries org A document (IDOR)"
req $JB GET /api/invoice-imports/$DOC/file | tail -2
req $JB GET /api/invoice-imports/$DOC | tail -2
req $JB DELETE /api/invoice-imports/$DOC | tail -2
echo "org B list count: $(curl -s "${HDR[@]}" -b $JB -c $JB $B/api/invoice-imports | jq '.documents|length')"
echo; echo "## 8. read_only member of org A"
sqlite3 $DB "update organisation_memberships set role='read_only' where user_id='$UA';"
req $JA POST /api/invoice-imports $TMP/jpg.json | tail -2
echo "read_only download status: $(curl -s -o /dev/null -w '%{http_code}' "${HDR[@]}" -b $JA -c $JA $B/api/invoice-imports/$DOC/file)"
sqlite3 $DB "update organisation_memberships set role='owner' where user_id='$UA';"
echo; echo "## 9. Delete blocked while linked to an invoice"
ORG=$(sqlite3 $DB "select organisation_id from import_documents where id='$DOC';")
CUST=$(curl -s -X POST "${HDR[@]}" -b $JA -c $JA $B/api/customers -d '{"name":"Cleancorp","email":"ap@cleancorp.example","country":"NZ"}' | jq -r .id)
curl -s -o /dev/null -X POST "${HDR[@]}" -b $JA -c $JA -H "Idempotency-Key: $(uuidgen)" $B/api/invoices-import -d '{"dryRun":false,"rows":[{"externalId":"cc-rcti-1","invoiceNumber":"CC-RCTI-0001","customerId":"'$CUST'","date":"2026-10-05","dueDate":"2026-10-20","currency":"NZD","taxInclusive":false,"taxRate":"15","items":[{"description":"Office cleaning October","quantity":"1","rate":"200.00"}]}]}'
INV=$(sqlite3 $DB "select id from invoices where organisation_id='$ORG' limit 1;")
sqlite3 $DB "update import_documents set committed_record_type='invoice', committed_record_id='$INV', status='committed' where id='$DOC'; update invoices set import_document_id='$DOC', source='import', external_issuer_name='Cleancorp', external_number='CC-RCTI-0001' where id='$INV';" 2>&1
echo "(linked doc $DOC -> invoice $INV directly in the temp DB; Phase 2 commit flow does this)"
req $JA DELETE /api/invoice-imports/$DOC
echo "document still stored: $(sqlite3 $DB "select status from import_documents where id='$DOC';")"
echo; echo "## 10. Audit events (DB)"
sqlite3 -header -column $DB "select action, count(*) n from import_document_events group by action;" 2>&1 || sqlite3 $DB "pragma table_info(import_document_events);"
kill $SP 2>/dev/null; sleep 1; lsof -ti tcp:3018 | xargs kill 2>/dev/null
echo; echo "server stopped; temp dir removed"
grep -ciE 'error' $TMP/server.log | sed 's/^/server.log error lines: /'
rm -rf $TMP
