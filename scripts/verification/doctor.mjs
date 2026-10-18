#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createServer} from 'node:net';
const checks=[];
const command=(name,args)=>{const r=spawnSync(name,args,{encoding:'utf8',timeout:8000});return {status:r.status===0?'PASS':'BLOCKED',detail:r.status===0?r.stdout.trim().split('\n')[0]:'Unavailable'};};
for(const [name,args] of [['node',['--version']],['pnpm',['--version']],['docker',['--version']]])checks.push({name,...command(name,args)});
for(const [name,path] of [['contracts','packages/contracts'],['api','api'],['playwright','playwright.config.ts']])checks.push({name,status:existsSync(path)?'PASS':'BLOCKED'});
for(const port of [3001,8080,55432]){
 const available=await new Promise(done=>{const s=createServer();s.once('error',()=>done(false));s.listen(port,'127.0.0.1',()=>s.close(()=>done(true)));});
 checks.push({name:'port-'+port,status:available?'PASS':'INFO',detail:available?'available':'occupied; verify ownership before reuse'});
}
console.log(JSON.stringify({checks,ready:checks.every(c=>c.status!=='BLOCKED')},null,2));
process.exit(checks.some(c=>c.status==='BLOCKED')?1:0);
