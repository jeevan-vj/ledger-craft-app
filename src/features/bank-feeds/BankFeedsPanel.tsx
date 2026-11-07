import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { bankFeedsApi } from './bankFeedsApi';
export function BankFeedsPanel({canManage=false}:{canManage?:boolean}){
 const client=useQueryClient();const query=useQuery({queryKey:['bank-feeds','akahu'],queryFn:bankFeedsApi.summary});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirmed,setConfirmed]=useState(false);
 const data=query.data;const stopped=data?.status==='revoked'||data?.status==='disconnected';
 async function act(disconnect=false){setBusy(true);setError('');setNotice('');try{if(disconnect){await bankFeedsApi.disconnect();setNotice('Akahu disconnected. Your accounting records are retained.');setConfirmed(false);}else{const result=await bankFeedsApi.sync();setNotice(`Imported ${result.imported}; skipped ${result.duplicates} previously recorded transactions.`);}await query.refetch();await client.invalidateQueries({queryKey:['bank-accounts']});}catch(e){setError(e instanceof Error?e.message:'Bank feeds are unavailable.');}finally{setBusy(false);}}
 return <ContentPanel><section aria-label="Akahu bank feeds" className="space-y-4">
  <h2 className="text-xl font-semibold">Bank connections</h2><p className="max-w-prose text-sm text-muted-foreground">Read-only bank information through Akahu. Imported statement lines require reconciliation; they do not establish GST treatment or a reviewed opening balance.</p>
  {query.isPending&&<p role="status">Loading bank connections…</p>}
  {(error||query.error)&&<p role="alert" className="text-sm text-destructive">{error||(query.error instanceof Error?query.error.message:'Unable to load bank connections.')}</p>}
  {query.isError&&<Button variant="outline" onClick={()=>void query.refetch()}>Retry bank connections</Button>}
  {data&&<><p className="text-sm">Connection: {data.status.replace(/_/g,' ')}{data.lastSyncedAt?` · Last sync ${data.lastSyncedAt}`:''}</p>{data.warnings.map(w=><p key={w} className="text-sm text-muted-foreground">{w}</p>)}
   {!data.accounts.length&&<p className="text-sm text-muted-foreground">No connected accounts.</p>}
   <ul className="divide-y divide-border">{data.accounts.map(a=><li key={a.id} className="space-y-1 py-3"><p className="font-medium">{a.name}</p><p className="text-sm text-muted-foreground">{a.institution} · {a.currency} · {a.status==='INACTIVE'?'Inactive — review in Akahu':'Active'}</p></li>)}</ul>
   {data.mode==='personal'&&canManage&&!stopped&&<><Button disabled={busy} onClick={()=>void act()}>Refresh Akahu feeds</Button><p className="text-xs text-muted-foreground">One refresh attempt per hour. Scheduled updates run daily for the configured internal Personal App.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy}/>Disconnect Akahu and retain imported accounting records</label><Button variant="outline" disabled={busy||!confirmed} onClick={()=>void act(true)}>Disconnect Akahu</Button></>}
  </>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
 </section></ContentPanel>;
}
