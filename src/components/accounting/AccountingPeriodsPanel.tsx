import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { closeAccountingPeriodRequestSchema, reopenAccountingPeriodRequestSchema } from '@ledgercraft/contracts';
import { useAuth } from '@/context/StableAuthContext';
import { accountingPeriodsApi } from '@/features/accounting-completion/accountingPeriodsApi';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { Button } from '@/components/ui/button';
import { PreparationCheck, PreparationField } from './PreparationFields';

export function AccountingPeriodsPanel(){
 const {me}=useAuth();const organisationId=me?.organisation.id;const client=useQueryClient();
 const state=useQuery({queryKey:['accounting-periods',organisationId],queryFn:accountingPeriodsApi.get,enabled:Boolean(organisationId)});
 const [mode,setMode]=useState<'close'|'reopen'>('close');const [date,setDate]=useState('');const [reason,setReason]=useState('');const [reviewed,setReviewed]=useState(false);
 useEffect(()=>{setReviewed(false);setReason('');setDate('');setMode('close');},[organisationId]);
 const mutation=useMutation({mutationFn:async(input:{scope:string;revision:number})=>({scope:input.scope,value:mode==='close'?await accountingPeriodsApi.close({through:date,reason,reviewed:true,expectedRevision:input.revision},input.scope):await accountingPeriodsApi.reopen({from:date,reason,reviewed:true,expectedRevision:input.revision},input.scope)}),onSuccess:async({scope,value})=>{client.setQueryData(['accounting-periods',scope],value);setReviewed(false);await client.invalidateQueries({queryKey:['reports']});},onError:()=>{setReviewed(false);void state.refetch();}});
 const value=state.data;const input={...(mode==='close'?{through:date}:{from:date}),reason,reviewed,expectedRevision:value?.revision??0};const valid=(mode==='close'?closeAccountingPeriodRequestSchema:reopenAccountingPeriodRequestSchema).safeParse(input).success;
 function edit(){setReviewed(false);mutation.reset();}
 return <ContentPanel><section aria-label="Accounting period controls" className="space-y-5">
  <div><h2 className="text-xl font-semibold">Accounting periods</h2><p className="mt-1 max-w-prose text-sm text-muted-foreground">Close a reviewed period to protect its transactions and accounting settings. Dates on or before the cutoff cannot be posted or altered. An owner or admin can reopen dates with a retained reason.</p></div>
  {state.isPending?<p role="status">Loading period controls…</p>:state.isError?<div role="alert"><p>Period controls could not be loaded.</p><Button variant="outline" onClick={()=>void state.refetch()}>Retry period controls</Button></div>:value?<>
   <p className="font-semibold">{value.closedThrough?`Closed through ${value.closedThrough}`:'No accounting cutoff is closed.'}</p>
   {value.canClose||value.canReopen?<>
    <label className="block space-y-2 text-sm font-medium">Period action<select className="h-11 w-full rounded-xl border border-input bg-background px-3" disabled={mutation.isPending} value={mode} onChange={e=>{setMode(e.target.value as typeof mode);edit();}}>{value.canClose?<option value="close">Close period</option>:null}{value.canReopen?<option value="reopen">Reopen period</option>:null}</select></label>
    <PreparationField label={mode==='close'?'Close through':'Reopen from'} type="date" value={date} disabled={mutation.isPending} onChange={v=>{setDate(v);edit();}}/>
    <PreparationField label="Period change reason" value={reason} disabled={mutation.isPending} onChange={v=>{setReason(v);edit();}}/>
    <PreparationCheck checked={reviewed} disabled={mutation.isPending} onChange={setReviewed}>I reviewed the reports, GST and bank reconciliation</PreparationCheck>
    <Button disabled={!valid||mutation.isPending||!organisationId||(mode==='reopen'&&!value.closedThrough)} onClick={()=>{if(organisationId)mutation.mutate({scope:organisationId,revision:value.revision});}}>{mutation.isPending?'Saving period change…':mode==='close'?'Close accounting period':'Reopen accounting period'}</Button>
    {mutation.isError?<p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>:null}
   </>:<p className="text-sm text-muted-foreground">Your role can view the cutoff and audit history.</p>}
   <div className="space-y-3"><h3 className="font-semibold">Period audit history</h3>{value.events.length?value.events.map(event=><article key={event.id} className="space-y-1 border-t border-border pt-3 text-sm"><p className="font-medium">{event.action==='close'?'Closed':'Reopened'} · {event.newClosedThrough??'All dates open'}</p><p>{event.reason}</p><p className="break-all text-muted-foreground">{event.createdAt} · Actor {event.actorId}</p></article>):<p className="text-sm text-muted-foreground">No period changes recorded.</p>}</div>
  </>:null}
 </section></ContentPanel>;
}
