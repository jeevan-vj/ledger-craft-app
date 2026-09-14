// Standalone real-SQLite baseline gate; no network or external database required.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const directory = new URL('.', import.meta.url);
const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON');
const migrations = readdirSync(directory).filter(name => /^\d.*\.sql$/.test(name)).sort();
assert.ok(migrations.length, 'SQLite baseline must exist');
for (const file of migrations) database.exec(readFileSync(new URL(file, directory), 'utf8'));
assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length >= 30);
const types = Object.fromEntries(database.prepare('PRAGMA table_info(invoices)').all().map(row => [row.name, row.type]));
for (const name of ['subtotal', 'total', 'total_paid']) assert.equal(types[name], 'TEXT');
database.exec("INSERT INTO organisations(id,name) VALUES ('org-a','A'),('org-b','B')");
database.exec("INSERT INTO users(id,name,email) VALUES ('u-a','A','a@example.test'),('u-b','B','b@example.test')");
database.exec("INSERT INTO customers(id,organisation_id,user_id,name,email) VALUES ('c-a','org-a','u-a','C','c@example.test')");
const invoice = ['i-a','org-a','u-a','INV-1','c-a','2026-09-11','2026-10-11','999999999999999.9999','0','999999999999999.9999'];
const insert = database.prepare('INSERT INTO invoices(id,organisation_id,user_id,invoice_number,customer_id,date,due_date,subtotal,tax_amount,total) VALUES (?,?,?,?,?,?,?,?,?,?)');
insert.run(...invoice);
assert.equal(database.prepare('SELECT subtotal FROM invoices').get().subtotal, invoice[7]);
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
database.exec("DELETE FROM invoices WHERE id='i-a'");
assert.equal(database.prepare('SELECT count(*) AS n FROM line_items').get().n, 0);
database.close();
console.log('SQLite baseline: schema, exact decimals, uniqueness, tenant foreign keys, cascade checks passed');
