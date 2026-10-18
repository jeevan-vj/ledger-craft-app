import test from 'node:test';
import assert from 'node:assert/strict';
import {plan} from '../planner.mjs';

test('unknown files are not silently accepted',()=>{
 const p=plan(['mystery/config.xyz'],'standard');
 assert.deepEqual(p.unknown,['mystery/config.xyz']);
});
test('financial changes require security evidence',()=>{
 const p=plan(['api/src/modules/invoices/invoice.ts'],'standard');
 assert.ok(p.sensitive.length);
 assert.ok(p.missing.some(x=>x.includes('verify-security')));
 assert.ok(p.selected.includes('verify-api'));
});
test('web changes select build, lint and tests',()=>{
 const p=plan(['src/pages/Home.tsx'],'standard');
 for(const name of ['verify-build','verify-lint','verify-tests'])assert.ok(p.selected.includes(name));
});
test('mobile changes do not require web suite',()=>{
 const p=plan(['mobile/src/Home.tsx'],'standard');
 assert.deepEqual(p.selected,['verify-mobile']);
});
test('tooling changes must verify core checks',()=>{
 const p=plan(['scripts/verification/cli.mjs'],'standard');
 assert.ok(p.selected.includes('verify-tests'));
});
test('single check never implies full readiness',()=>{
 const p=plan(['src/App.tsx'],'standard','verify-lint');
 assert.ok(p.missing.includes('verify-tests'));
});
