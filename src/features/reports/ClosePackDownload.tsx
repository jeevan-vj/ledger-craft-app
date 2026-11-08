import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/context/StableAuthContext';
import { Button } from '@/components/ui/button';
import { downloadClosePack } from './closePackDownload';
export function ClosePackDownload({from,to}:{from:string;to:string}){
 const {me}=useAuth();const download=useMutation({mutationFn:()=>downloadClosePack(from,to)});
 if(!me?.permissions.includes('reports.read')||!me.permissions.includes('banking.read'))return null;
 return <section aria-label="Accountant close pack" className="space-y-3 rounded-2xl bg-card p-5 shadow-surface">
  <h2 className="text-lg font-semibold">Accountant close pack</h2><p className="max-w-prose text-sm text-muted-foreground">Download full-company accrual reports for {from} to {to}, with the general ledger, bank reconciliation and GST records. Check the included review notes before handing the pack to your accountant.</p>
  <Button variant="outline" disabled={download.isPending} onClick={()=>download.mutate()}>{download.isPending?'Preparing close pack…':'Download accountant close pack'}</Button>
  {download.isError?<p role="alert" className="text-sm text-destructive">{download.error.message}</p>:null}{download.isSuccess?<p role="status" className="text-sm">Close pack downloaded for {from} to {to}.</p>:null}
 </section>;
}
