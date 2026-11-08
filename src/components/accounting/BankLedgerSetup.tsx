import { useEffect,useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/StableAuthContext';
import { bankLedgerApi } from '@/features/accounting-completion/bankLedgerApi';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { Button } from '@/components/ui/button';
export function BankLedgerSetup({onPrepared}:{onPrepared:()=>void|Promise<void>}){
 const {me}=useAuth();const scope=me?.organisation.id;const canWrite=me?.permissions.includes('banking.write');const client=useQueryClient();const [bank,setBank]=useState('');
 const banks=useQuery({queryKey:['bank-ledger-setup',scope],queryFn:bankLedgerApi.banks,enabled:Boolean(scope&&canWrite)});
 const prepare=useMutation({mutationFn:(input:{bank:string;scope:string})=>bankLedgerApi.prepare(input.bank,input.scope),onSuccess:async()=>{await client.invalidateQueries({queryKey:['accounts']});await onPrepared();}});
 const reset=prepare.reset;
 useEffect(()=>{setBank('');reset();},[scope,reset]);
 if(!canWrite)return <p className="text-sm text-muted-foreground">Bank ledger setup requires banking write access.</p>;
 return <ContentPanel><section aria-label="Bank ledger setup" className="space-y-4"><h2 className="text-xl font-semibold">Link a bank to your ledger</h2><p className="max-w-prose text-sm text-muted-foreground">Prepare the business bank for opening balances, receipts and reconciliation. This creates an empty ledger account; it does not post the bank's opening amount.</p>
  {banks.isPending?<p role="status">Loading business banks…</p>:banks.isError?<div role="alert"><p>Business banks could not be loaded.</p><Button variant="outline" onClick={()=>void banks.refetch()}>Retry bank ledger setup</Button></div>:<>
   <label className="block space-y-2 text-sm font-medium">Business bank<select value={bank} disabled={prepare.isPending} onChange={e=>{setBank(e.target.value);prepare.reset();}} className="h-11 w-full rounded-xl border border-input bg-background px-3"><option value="">Choose an active NZD bank</option>{banks.data?.filter(b=>b.isActive&&b.currency==='NZD').map(b=><option key={b.id} value={b.id}>{b.accountName}</option>)}</select></label>
   <Button disabled={!bank||!scope||prepare.isPending} onClick={()=>{if(scope)prepare.mutate({bank,scope});}}>{prepare.isPending?'Preparing ledger…':'Prepare bank ledger'}</Button>
   {prepare.isError?<p role="alert" className="text-sm text-destructive">{prepare.error.message}</p>:null}{prepare.isSuccess?<p role="status">Ledger ready: {prepare.data.name}. Enter brought-forward amounts through reviewed opening balances.</p>:null}
  </>}
 </section></ContentPanel>;
}
