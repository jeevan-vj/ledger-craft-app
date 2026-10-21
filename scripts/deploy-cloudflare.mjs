#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, openSync, closeSync, unlinkSync, readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const args=process.argv.slice(2);
if(args.includes('--help') || args.includes('-h')) {
  console.log(`Deploy LedgerCraft to the existing Cloudflare resources.

Usage:
  pnpm deploy:cloudflare          Validate, build, deploy API + website, verify
  pnpm deploy:check               Run local checks and Wrangler dry run only
  pnpm db:generate --name change  Generate SQL after editing the Drizzle schema
  pnpm db:migrate                Apply SQL to the LOCAL SQLite database only

Targets:
  Pages: ledger-craft-app (https://easybiz.iamjeevan.com)
  Worker: ledgercraft-api (Identity + per-organisation Ledger SQLite objects)

SQL in api/sqlite-migrations is bundled with the Worker. Pending migrations
run atomically before each object's next request; applied SQL is not rerun.
Review new SQL, keep existing migrations unchanged, then deploy.
The script preserves the signing secret and verifies the published release.
Requires Node.js 24+, pnpm, and an authenticated Wrangler session.
Live verification creates synthetic test accounts and records.`);
  process.exit(0);
}
const unknown=args.filter(arg=>arg!=='--check');
if(unknown.length) {
  console.error(`Unknown option: ${unknown.join(', ')}. Use --help.`);
  process.exit(1);
}
const check=args.includes('--check');
if(Number(process.versions.node.split('.')[0])<24) throw new Error('Node.js 24 or newer is required');
const config='deploy/api/wrangler.jsonc';
const site='https://easybiz.iamjeevan.com';
const api='https://ledgercraft-api.jeevan90wijerathna.workers.dev';
const expectedMigration=readdirSync('api/sqlite-migrations').filter(name=>name.endsWith('.sql')).sort().at(-1);
const apiFlags=Object.fromEntries(['CUSTOMERS','BUSINESS','ITEMS','INVOICES','EXPENSES','PAYMENTS','ACCOUNTS','BANK','RECONCILIATION','TAX','STORAGE','RECEIPTS','AI','CONVERSATIONS','JOURNALS'].map(name=>[`VITE_${name}_API`,'true']));
const release=process.env.SENTRY_RELEASE || process.env.GITHUB_SHA || '';
const environment={...process.env,...apiFlags,
  ...(release ? {SENTRY_RELEASE: release, VITE_SENTRY_RELEASE: process.env.VITE_SENTRY_RELEASE || release} : {}),
  CLOUDFLARE_ACCOUNT_ID:'c611a72b3bacd0c105ab864d7006fca7',VITE_OPENAI_API_KEY:'',VITE_RESEND_API_KEY:'', WRANGLER_LOG_PATH:process.env.WRANGLER_LOG_PATH ?? '/tmp/ledgercraft-wrangler.log'};
function run(command,args,options={}) {
  const result=spawnSync(command,args,{cwd:root,env:environment,stdio:'inherit',...options});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`${command} failed (${result.status})`);
  return result.stdout;
}
const pnpm=(...args)=>run('pnpm',args);
const wrangler=(...args)=>pnpm('exec','wrangler',...args);
async function verify(base,version) {
  for(const path of ['/api/healthz','/api/readyz']) {
    const response=await fetch(base+path);
    if(!response.ok || (await response.json()).status!=='ok') throw new Error(`Readiness failed: ${path}`);
    if(path==='/api/readyz' && response.headers.get('X-Ledgercraft-Migration')!==expectedMigration) throw new Error('Published database has not applied the expected migration');
  }
  const unauthenticated=await fetch(base+'/api/me');
  if(unauthenticated.status!==401) throw new Error('Authentication boundary failed');
  if(version) {
    const deployed=await (await fetch(base+'/version.json',{cache:'no-store'})).json();
    if(!version.hash || deployed.hash!==version.hash) throw new Error('Published build does not match local build');
    for(const path of ['/','/login','/signup']) {
      const response=await fetch(base+path);
      if(!response.ok || !(await response.text()).includes('<div id="root">')) throw new Error(`Frontend route failed: ${path}`);
    }
  }
}
async function verifyPublished(base,version) {
  let failure;
  for(let attempt=0;attempt<20;attempt++) {
    try {await verify(base,version);return;} catch(error) {failure=error;}
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  throw failure;
}
mkdirSync('.wrangler',{recursive:true});
let lock;
try {
  lock=openSync('.wrangler/release.lock','wx');
  pnpm('install','--frozen-lockfile','--ignore-scripts');
  run('node',['scripts/generate-sqlite-migrations.mjs']);
  pnpm('verify:w13');
  run('node',['api/sqlite-migrations/verify.mjs']);
  run('pnpm',['build'],{env:{...environment,NODE_ENV:'production'}});
  wrangler('pages','functions','build','functions','--outdir','.wrangler/pages-check');
  run('node_modules/.bin/tsc',['--noEmit','-p','deploy/api/tsconfig.json']);
  wrangler('deploy','--config',config,'--dry-run','--outdir','.wrangler/worker-check');
  if(check) {console.log('Local release checks passed. No cloud resources changed.');}
  else {
    // An authenticated resource read fails closed; whoami alone can exit zero when logged out.
    wrangler('pages','project','list');
    // A missing local file must never rotate an existing remote signing key.
    const secretPath='deploy/secrets.local.json';
    let preserveRemote=false;
    if(!existsSync(secretPath)) {
      const listed=spawnSync('node_modules/.bin/wrangler',['secret','list','--config',config],{cwd:root,env:environment,encoding:'utf8'});
      if(listed.status===0) {
        const names=JSON.parse(listed.stdout);
        preserveRemote=names.some(secret=>secret.name==='BETTER_AUTH_SECRET');
      } else if(!`${listed.stdout} ${listed.stderr}`.includes('Worker "ledgercraft-api" not found.')) {
        throw new Error('Could not inspect remote signing secret. Deployment stopped without changing it.');
      }
      if(!preserveRemote) writeFileSync(secretPath,JSON.stringify({BETTER_AUTH_SECRET:randomBytes(48).toString('base64url')}),{mode:0o600});
    }
    if(preserveRemote) {
      wrangler('deploy','--config',config);
    } else {
      const secrets=JSON.parse(readFileSync(secretPath,'utf8'));
      if(typeof secrets.BETTER_AUTH_SECRET!=='string' || secrets.BETTER_AUTH_SECRET.length<32 || Object.keys(secrets).some(k=>k!=='BETTER_AUTH_SECRET')) throw new Error('Invalid deployment secret file');
      wrangler('deploy','--config',config,'--secrets-file',secretPath);
    }
    await verifyPublished(api);
    run('node',['scripts/upload-web-sourcemaps.mjs']);
    run('node',['scripts/delete-sourcemaps.mjs','dist']);
    wrangler('pages','deploy','dist','--project-name','ledger-craft-app','--branch','main');
    await verifyPublished(site,JSON.parse(readFileSync('dist/version.json','utf8')));
    await verifyPublished('https://ledger-craft-app.pages.dev',JSON.parse(readFileSync('dist/version.json','utf8')));
    run('node',['scripts/verify-cloudflare.mjs',site]);
    console.log(`Published and verified ${site}.`);
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {if(lock!==undefined){closeSync(lock);unlinkSync('.wrangler/release.lock');}}
