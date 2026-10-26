// Standalone real-SQLite baseline gate; no network or external database required.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const directory = new URL('.', import.meta.url);
const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON');
const migrations = readdirSync(directory).filter(name => /^\d.*\.sql$/.test(name)).sort();
assert.ok(migrations.length, 'SQLite baseline must exist');
for (const file of migrations) {
  if (file === '0018_invoice-import-phase1.sql') {
    database.exec("INSERT INTO organisations(id,name) VALUES ('org-legacy','Legacy')");
    database.exec("INSERT INTO users(id,name,email) VALUES ('u-legacy','Legacy','legacy@example.test')");
    database.exec("INSERT INTO customers(id,organisation_id,user_id,name,email) VALUES ('c-legacy','org-legacy','u-legacy','Legacy Customer','customer@example.test')");
    database.exec("INSERT INTO vendors(id,organisation_id,user_id,name) VALUES ('v-legacy','org-legacy','u-legacy','Legacy Vendor')");
    database.exec("INSERT INTO invoices(id,organisation_id,user_id,invoice_number,customer_id,date,due_date,subtotal,tax_amount,total) VALUES ('i-legacy','org-legacy','u-legacy','INV-LEGACY','c-legacy','2026-10-01','2026-10-21','100','15','115')");
    database.exec("INSERT INTO bills(id,organisation_id,user_id,bill_number,vendor_id,issue_date,due_date,subtotal,tax_amount,total,balance_due) VALUES ('b-legacy','org-legacy','u-legacy','BILL-LEGACY','v-legacy','2026-10-01','2026-10-21','100','15','115','115')");
  }
  database.exec(readFileSync(new URL(file, directory), 'utf8'));
}
assert.equal(database.prepare("SELECT source FROM invoices WHERE id='i-legacy'").get().source, 'manual');
assert.equal(database.prepare("SELECT source FROM bills WHERE id='b-legacy'").get().source, 'manual');
assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length >= 30);
const types = Object.fromEntries(database.prepare('PRAGMA table_info(invoices)').all().map(row => [row.name, row.type]));
for (const name of ['subtotal', 'total', 'total_paid']) assert.equal(types[name], 'TEXT');
const expenseColumns = Object.fromEntries(database.prepare('PRAGMA table_info(expenses)').all().map(row => [row.name, row]));
assert.equal(expenseColumns.gst_treatment.dflt_value, "'standard'");
assert.equal(expenseColumns.gst_exemption_reason.dflt_value, "'none'");
assert.equal(expenseColumns.gst_claimable_percentage.dflt_value, '100');
assert.equal(expenseColumns.private_use_percentage.dflt_value, '0');
database.exec("INSERT INTO organisations(id,name) VALUES ('org-a','A'),('org-b','B')");
database.exec("INSERT INTO users(id,name,email) VALUES ('u-a','A','a@example.test'),('u-b','B','b@example.test')");
database.exec("INSERT INTO customers(id,organisation_id,user_id,name,email) VALUES ('c-a','org-a','u-a','C','c@example.test')");
database.exec("INSERT INTO expenses(id,organisation_id,user_id,description,amount,expense_date) VALUES ('e-a','org-a','u-a','Expense','115','2026-10-02')");
const expenseDefaults = database.prepare("SELECT gst_treatment, gst_exemption_reason, gst_claimable_percentage, private_use_percentage FROM expenses WHERE id='e-a'").get();
assert.equal(expenseDefaults.gst_treatment, 'standard');
assert.equal(expenseDefaults.gst_exemption_reason, 'none');
assert.equal(expenseDefaults.gst_claimable_percentage, 100);
assert.equal(expenseDefaults.private_use_percentage, 0);
assert.throws(() => database.prepare("UPDATE expenses SET gst_claimable_percentage=101 WHERE id='e-a'").run(), /CHECK constraint failed/);
assert.throws(() => database.prepare("UPDATE expenses SET gst_treatment='invalid' WHERE id='e-a'").run(), /CHECK constraint failed/);
const invoice = ['i-a','org-a','u-a','INV-1','c-a','2026-09-11','2026-10-11','999999999999999.9999','0','999999999999999.9999'];
const insert = database.prepare('INSERT INTO invoices(id,organisation_id,user_id,invoice_number,customer_id,date,due_date,subtotal,tax_amount,total) VALUES (?,?,?,?,?,?,?,?,?,?)');
insert.run(...invoice);
assert.equal(database.prepare("SELECT subtotal FROM invoices WHERE id='i-a'").get().subtotal, invoice[7]);
assert.throws(() => insert.run('i-b', ...invoice.slice(1)), /UNIQUE constraint failed/);
assert.throws(() => insert.run('i-c','org-b','u-b','INV-2',...invoice.slice(4)), /FOREIGN KEY constraint failed/);
database.exec("INSERT INTO line_items(id,organisation_id,invoice_id,description,quantity,rate,total) VALUES ('l-a','org-a','i-a','line','1','1','1')");
for (const quantity of ['0', '0.0000', '-1', '1e3', '1.2.3']) {
  assert.throws(() => database.prepare("UPDATE line_items SET quantity=? WHERE id='l-a'").run(quantity), /CHECK constraint failed/);
}
assert.throws(() => database.prepare("UPDATE line_items SET rate='-0.0001' WHERE id='l-a'").run(), /CHECK constraint failed/);
database.prepare("INSERT INTO auth_accounts(id,account_id,provider_id,user_id,password) VALUES (?,?,?,?,?)").run('a-a','u-a','credential','u-a','hashed-password-fixture');
assert.equal(database.prepare("SELECT issuer FROM auth_accounts WHERE id='a-a'").get().issuer, 'credential');
assert.ok(Number.isInteger(database.prepare("SELECT created_at FROM users WHERE id='u-a'").get().created_at));
const importBatchColumns = Object.fromEntries(database.prepare('PRAGMA table_info(import_batches)').all().map(row => [row.name, row]));
assert.equal(importBatchColumns.file_count.notnull, 1);
const importDocumentColumns = Object.fromEntries(database.prepare('PRAGMA table_info(import_documents)').all().map(row => [row.name, row]));
for (const name of ['sha256', 'storage_key', 'extraction_draft_json', 'duplicate_of_document_id']) assert.ok(importDocumentColumns[name]);
database.prepare("INSERT INTO import_batches(id,organisation_id,created_by,status,file_count) VALUES ('ib-a','org-a','u-a','uploaded',2)").run();
const insertImportDocument = database.prepare(`INSERT INTO import_documents(
  id,organisation_id,batch_id,status,original_filename,mime_type,size_bytes,sha256,storage_key,uploaded_by
) VALUES (?,?,?,?,?,?,?,?,?,?)`);
const duplicateHash = 'a'.repeat(64);
insertImportDocument.run('idoc-a', 'org-a', 'ib-a', 'uploaded', 'invoice.pdf', 'application/pdf', 128, duplicateHash, 'org-a/imports/idoc-a.pdf', 'u-a');
insertImportDocument.run('idoc-b', 'org-a', 'ib-a', 'uploaded', 'invoice-copy.pdf', 'application/pdf', 128, duplicateHash, 'org-a/imports/idoc-b.pdf', 'u-a');
assert.equal(database.prepare("SELECT count(*) AS n FROM import_documents WHERE organisation_id='org-a' AND sha256=?").get(duplicateHash).n, 2);
assert.throws(() => insertImportDocument.run('idoc-c', 'org-b', 'ib-a', 'uploaded', 'invoice.pdf', 'application/pdf', 128, duplicateHash, 'org-b/imports/idoc-c.pdf', 'u-b'), /FOREIGN KEY constraint failed/);
assert.throws(() => insertImportDocument.run('idoc-d', 'org-a', 'ib-a', 'invalid', 'invoice.pdf', 'application/pdf', 128, duplicateHash, 'org-a/imports/idoc-d.pdf', 'u-a'), /CHECK constraint failed/);
database.prepare("INSERT INTO import_document_events(id,organisation_id,document_id,action,actor_user_id) VALUES ('ide-a','org-a','idoc-a','uploaded','u-a')").run();
assert.throws(() => database.prepare("UPDATE import_document_events SET action='discarded' WHERE id='ide-a'").run(), /import document events are immutable/);
assert.throws(() => database.prepare("DELETE FROM import_document_events WHERE id='ide-a'").run(), /import document events are immutable/);
database.exec("DELETE FROM invoices WHERE id='i-a'");
assert.equal(database.prepare('SELECT count(*) AS n FROM line_items').get().n, 0);
const quoteColumns = Object.fromEntries(database.prepare('PRAGMA table_info(quotes)').all().map(row => [row.name, row]));
for (const name of ['subtotal', 'tax_amount', 'tax_rate', 'total', 'discount']) assert.equal(quoteColumns[name].type, 'TEXT');
const profileColumns = Object.fromEntries(database.prepare('PRAGMA table_info(business_profiles)').all().map(row => [row.name, row]));
assert.equal(profileColumns.quote_number_format.dflt_value, "'QUO-{YYYY}-{SEQ}'");
assert.equal(profileColumns.quote_number_sequence.dflt_value, '1');
assert.equal(profileColumns.quote_validity_days.dflt_value, '30');
assert.equal(profileColumns.default_quote_kind.dflt_value, "'quote'");
const insertQuote = database.prepare('INSERT INTO quotes(id,organisation_id,user_id,quote_number,customer_id,date,expiry_date,subtotal,tax_amount,tax_rate,total) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
insertQuote.run('q-a', 'org-a', 'u-a', 'QUO-1', 'c-a', '2026-10-01', '2026-10-31', '100.00', '15.00', '15', '115.00');
assert.equal(database.prepare("SELECT subtotal FROM quotes WHERE id='q-a'").get().subtotal, '100.00');
assert.throws(() => insertQuote.run('q-b', 'org-a', 'u-a', 'QUO-2', 'c-a', '2026-10-31', '2026-10-01', '1', '0', '0', '1'), /CHECK constraint failed/);
assert.throws(() => insertQuote.run('q-c', 'org-b', 'u-b', 'QUO-3', 'c-a', '2026-10-01', '2026-10-31', '1', '0', '0', '1'), /FOREIGN KEY constraint failed/);
database.exec("INSERT INTO quote_line_items(id,organisation_id,quote_id,description,quantity,rate,total) VALUES ('ql-a','org-a','q-a','line','1','1','1')");
database.exec("DELETE FROM quotes WHERE id='q-a'");
assert.equal(database.prepare('SELECT count(*) AS n FROM quote_line_items').get().n, 0);
database.close();
console.log('SQLite baseline: schema, expense GST constraints, exact decimals, uniqueness, tenant foreign keys, cascade checks passed');
