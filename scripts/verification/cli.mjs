#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const profile = process.argv[2] || 'fast';
if (!['fast', 'standard', 'pr'].includes(profile)) {
  console.error('Usage: node scripts/verification/cli.mjs fast|standard|pr');
  process.exit(2);
}
const base = process.env.VERIFY_BASE || 'main';
const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
const diff = git('diff', '--name-only', '--diff-filter=ACMRT', `${base}...HEAD`);
const local = git('diff', '--name-only', '--diff-filter=ACMRT', 'HEAD');
const untracked = git('ls-files', '--others', '--exclude-standard');
const files = [...new Set([...(diff.status === 0 ? diff.stdout.split('\n') : []), ...(local.status === 0 ? local.stdout.split('\n') : []), ...(untracked.status === 0 ? untracked.stdout.split('\n') : [])].filter(Boolean))];
if (diff.status !== 0 && profile !== 'pr') console.error('Base ref unavailable; selecting conservative checks');
if (diff.status !== 0 && profile === 'pr') {
  console.error('Cannot compare PR with base; set VERIFY_BASE to fetched base ref');
  process.exit(2);
}
const all = profile === 'pr' || diff.status !== 0;
const shared = files.some(f => /^(packages\/contracts\/|pnpm-lock.yaml$|pnpm-workspace.yaml$|package.json$)/.test(f));
const api = all || shared || files.some(f => /^(api\/|packages\/contracts\/)/.test(f));
const web = all || shared || files.some(f => /^(src\/|public\/|index.html$|vite.config|tsconfig|playwright.config)/.test(f));
const mobile = all || shared || files.some(f => f.startsWith('mobile/'));
const db = files.some(f => /^(api\/drizzle\/|api\/sqlite-migrations\/|api\/src\/.*(schema|migration))/i.test(f));
const security = files.some(f => /(auth|permission|session|organisation|tenant|rls)/i.test(f));
const finance = files.some(f => /(invoice|journal|ledger|payment|tax|gst|reconcil|expense)/i.test(f));
const steps = [];
const add = (name, cmd, args, required=true) => steps.push({name,cmd,args,required});
if (api) {
  add('contracts', 'pnpm', ['test:contracts']);
  add('api-tests', 'pnpm', ['test:api']);
  add('api-types', 'pnpm', ['type-check:api']);
}
if (web) {
  add('web-tests', 'pnpm', ['test:run']);
  if (profile !== 'fast') add('web-build', 'pnpm', ['build']);
}
if (mobile) {
  add('mobile-tests', 'npm', ['test','--','--ci','--watchAll=false'], profile === 'pr');
  if (profile !== 'fast') add('mobile-export', 'npx', ['expo','export','--platform','ios'], true);
}
if (profile === 'pr') {
  add('web-lint', 'pnpm', ['lint']);
  add('web-typecheck', 'pnpm', ['type-check']);
}
const dir = resolve('artifacts/verification');
mkdirSync(dir, {recursive:true});
const checks = [];
for (const step of steps) {
  const start = Date.now();
  const result = spawnSync(step.cmd, step.args, {
    cwd: step.name.startsWith('mobile-') ? resolve('mobile') : process.cwd(),
    encoding: 'utf8', maxBuffer: 32*1024*1024, timeout: 10*60*1000,
    env: {...process.env, CI: process.env.CI || '1'}
  });
  const output = (result.stdout || '') + '\n' + (result.stderr || '');
  const log = `${dir}/${step.name}.log`;
  writeFileSync(log, output);
  checks.push({name:step.name,status:result.status===0?'PASS':'FAIL',required:step.required,exitCode:result.status,elapsedMs:Date.now()-start,log,tail:result.status===0?undefined:output.slice(-2500)});
}
const blocked = (db || security || finance) && profile !== 'fast';
const summary = {
  schemaVersion:1, profile, base, head:git('rev-parse','HEAD').stdout.trim(),
  changedFiles:files, risk:{database:db,security,accounting:finance},
  checks, status:checks.some(x=>x.required&&x.status==='FAIL')?'FAIL':blocked?'BLOCKED':'PASS',
  note:blocked?'Domain-sensitive changes require additional isolated DB/security/accounting evidence before approval':undefined
};
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({...summary,checks:checks.map(({tail,...x})=>x)},null,2));
process.exit(summary.status==='PASS'?0:1);
