// Pure verification planning. Never execute commands here.
export const catalog={
 'verify-build':{command:['pnpm','type-check'],areas:['web']},
 'verify-tests':{command:['pnpm','test:run'],areas:['web']},
 'verify-lint':{command:['pnpm','lint'],areas:['web']},
 'verify-api':{command:['pnpm','test:contracts'],areas:['api','contracts']},
 'verify-ui':{command:['pnpm','test:e2e','--','--project=chromium'],areas:['ui']},
 'verify-database':{command:['pnpm','test:api'],areas:['database','api']},
 'verify-security':{command:['pnpm','exec','git','--version'],areas:['security'],placeholder:true},
 'verify-pr':{aggregate:true,areas:[]},
 'verify-api-types':{command:['pnpm','type-check:api'],areas:['api','contracts']},
 'verify-mobile':{command:['npm','test','--','--ci','--watchAll=false'],cwd:'mobile',areas:['mobile']}
};
const patterns=[
 [/^\.cursor\/skills\/verify-[^/]+\//,['tooling']],
 [/^\.agents\/skills\//,['tooling']],
 [/^(src\/|public\/|index.html$|vite.config|tsconfig|eslint.config)/,['web','ui']],
 [/^(api\/)/,['api','database']],
 [/^packages\/contracts\//,['contracts','api','web','mobile']],
 [/^mobile\//,['mobile']],
 [/^(tests\/e2e\/|playwright.config)/,['ui']],
 [/^(pnpm-lock.yaml|pnpm-workspace.yaml|package.json|\.npmrc)$/ ,['web','api','contracts','mobile']],
 [/^(\.github\/|scripts\/verification\/|\.cursor\/skills\/ledgercraft-verify)/,['tooling']],
 [/^(README|docs\/|.*\.md$)/,['docs']]
];
export function plan(files,profile='fast',requested=null){
 const areas=new Set(),unknown=[],sensitive=[];
 for(const file of files){
  const matched=patterns.filter(([regex])=>regex.test(file));
  if(!matched.length)unknown.push(file);
  matched.forEach(([,tags])=>tags.forEach(tag=>areas.add(tag)));
  if(/(invoice|journal|ledger|payment|tax|gst|reconcil|expense|auth|permission|session|organisation|tenant|rls|migration|schema)/i.test(file))sensitive.push(file);
 }
 const needed=new Set();
 if(areas.has('web'))['verify-build','verify-tests','verify-lint'].forEach(x=>needed.add(x));
 if(areas.has('api')||areas.has('contracts'))['verify-api','verify-api-types','verify-database'].forEach(x=>needed.add(x));
 if(areas.has('mobile'))needed.add('verify-mobile');
 if(areas.has('ui'))needed.add('verify-ui');
 if(sensitive.length)needed.add('verify-security');
 if(areas.has('tooling'))['verify-build','verify-tests','verify-lint','verify-api','verify-api-types'].forEach(x=>needed.add(x));
 const selected=requested&&requested!=='verify-pr'?[requested]:[...needed].filter(x=>profile!=='fast'||!['verify-ui','verify-build','verify-database'].includes(x));
 const missing=requested&&requested!=='verify-pr'?[...needed].filter(x=>x!==requested):[];
 if(needed.has('verify-security')){ // Placeholder must never count as a real security check.
  const index=selected.indexOf('verify-security');
  if(index!==-1)selected.splice(index,1);
  if(!missing.includes('verify-security'))missing.push('verify-security (not implemented)');
 }
 if(profile==='pr'&&areas.has('docs')&&needed.size===0&&!unknown.length){} // documentation-only permitted
 return {catalog,selected,missing,unknown,sensitive};
}
