#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {plan} from './planner.mjs';

const args=process.argv.slice(2);
const profile=['fast','standard','pr'].includes(args[0])?args[0]:'fast';
const requested=args.find(x=>x.startsWith('--check='))?.slice(8);
const base=process.env.VERIFY_BASE || 'main';
const git=(...a)=>spawnSync('git',a,{encoding:'utf8'});
const comparison=git('diff','--name-only','--diff-filter=ACDMRT',base+'...HEAD');
const working=git('diff','--name-only','--diff-filter=ACDMRT','HEAD');
const staged=git('diff','--cached','--name-only','--diff-filter=ACDMRT');
const untracked=git('ls-files','--others','--exclude-standard');
const head=git('rev-parse','HEAD').stdout?.trim()||null;
const files=[...new Set([comparison,working,staged,untracked].filter(x=>x.status===0).flatMap(x=>x.stdout.split('\n')).filter(Boolean))];
const dir=resolve('artifacts/verification');mkdirSync(dir,{recursive:true});
const available=Object.keys(plan([], 'fast').catalog);
if(requested&&!available.includes(requested)){console.error('Unknown check: '+requested);process.exit(2);}
const missingBase=comparison.status!==0;
const selection=plan(files,profile,requested);
const checks=[];
const redact=s=>s.replace(/(postgres(?:ql)?:\/\/)[^\s"'<>]+/gi,'$1[REDACTED]').replace(/((?:api[_-]?key|secret|token|password|authorization)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]');
for(const name of selection.selected){
  const def=selection.catalog[name];
  const start=Date.now();
  const result=spawnSync(def.command[0],def.command.slice(1),{cwd:resolve(def.cwd||'.'),encoding:'utf8',maxBuffer:16*1024*1024,timeout:600000,env:{...process.env,CI:process.env.CI||'1'}});
  const output=redact((result.stdout||'')+'\n'+(result.stderr||'')+'\n'+(result.error?.message||''));
  const log=dir+'/'+name+'.log';writeFileSync(log,output,{mode:0o600});
  const status=result.error?.code==='ETIMEDOUT'?'TIMEOUT':result.error?'ERROR':result.status===0?'PASS':'FAIL';
  checks.push({name,status,exitCode:result.status,durationMs:Date.now()-start,log,diagnostic:status==='PASS'?undefined:output.slice(-1600)});
}
const blockers=[];
if(missingBase)blockers.push('BASE_REF_UNAVAILABLE');
if(files.length===0)blockers.push('NO_CHANGES_DETECTED');
if(selection.unknown.length)blockers.push('UNCLASSIFIED_CHANGES: '+selection.unknown.join(', '));
if(selection.missing.length)blockers.push('MISSING_REQUIRED_CHECKS: '+selection.missing.join(', '));
if(selection.sensitive.length&&profile!=='fast')blockers.push('DOMAIN_EVIDENCE_REQUIRED: '+selection.sensitive.join(', '));
const failed=checks.some(x=>x.status!=='PASS');
const status=failed?'FAIL':blockers.length?'BLOCKED':'PASS';
const summary={schemaVersion:1,profile,requested:requested||null,base,head,changedFiles:files,selected:selection.selected,checks,blockers,status,readiness:profile==='pr'&&status==='PASS'?'CHECKS_PASSED':'NOT_ESTABLISHED'};
writeFileSync(dir+'/summary.json',JSON.stringify(summary,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({...summary,checks:checks.map(({diagnostic,...c})=>c)},null,2));
process.exit(status==='PASS'?0:1);
