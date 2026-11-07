import { describe,it,expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync,readFileSync } from 'node:fs';
describe('Akahu migration preserves books with foreign keys enabled',()=>{
 it('replaces only validation triggers while retaining bank, split, attachment and reconciliation identities',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  const folder=new URL('../../../sqlite-migrations/',import.meta.url);
  for(const name of readdirSync(folder).filter(n=>n.endsWith('.sql')&&Number(n.slice(0,4))<=28).sort())db.exec(readFileSync(new URL(name,folder),'utf8'));
  db.exec(`INSERT INTO users(id,name,email)VALUES('user','Owner','owner@example.test');INSERT INTO organisations(id,name)VALUES('org','Test');
   INSERT INTO bank_accounts(id,organisation_id,user_id,account_name,account_number,bank_name,account_type)VALUES('bank','org','user','Operating','12-3456','Bank','checking');
   INSERT INTO bank_transactions(id,organisation_id,user_id,bank_account_id,transaction_date,description,amount,type,source)VALUES('tx','org','user','bank','2026-10-01','Original','0.10','debit','import');
   INSERT INTO bank_transaction_splits(id,organisation_id,transaction_id,category,amount)VALUES('split','org','tx','Expense','0.10');
   INSERT INTO bank_transaction_attachments(id,organisation_id,transaction_id,object_key,filename,content_type,size)VALUES('attachment','org','tx','org/receipt','receipt.pdf','application/pdf',20);
   INSERT INTO reconciliation_sessions(id,organisation_id,user_id,bank_account_id,statement_start_date,statement_end_date,statement_opening_balance,statement_closing_balance,book_opening_balance)VALUES('session','org','user','bank','2026-10-01','2026-10-31','0','-0.10','0');
   INSERT INTO reconciliation_matches(id,organisation_id,reconciliation_id,bank_transaction_id,match_type)VALUES('match','org','session','tx','manual');`);
  const names=['bank_accounts','bank_transactions','bank_transaction_splits','bank_transaction_attachments','reconciliation_sessions','reconciliation_matches'];
  const before=names.map(n=>db.prepare(`SELECT * FROM ${n}`).all());
  db.exec('SAVEPOINT migration');db.exec(readFileSync(new URL('0030_akahu-personal-bank-feeds.sql',folder),'utf8'));db.exec('RELEASE migration');
  expect(names.map(n=>db.prepare(`SELECT * FROM ${n}`).all())).toEqual(before);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(()=>db.exec("UPDATE bank_transactions SET source='feed' WHERE id='tx'")).not.toThrow();
  expect(()=>db.exec("UPDATE bank_transactions SET source='unsupported' WHERE id='tx'")).toThrow();
  db.close();
 });
});
