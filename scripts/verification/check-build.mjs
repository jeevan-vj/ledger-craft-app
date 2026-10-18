#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
let failed=false;
for(const args of [['type-check'],['build']]){
 const r=spawnSync('pnpm',args,{encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024});
 if(r.status!==0){failed=true;console.error(args[0]+' failed\n'+(r.stderr||r.stdout||r.error?.message||'unknown failure').slice(-2500));}
 else console.log(args[0]+': PASS');
}
process.exit(failed?1:0);
