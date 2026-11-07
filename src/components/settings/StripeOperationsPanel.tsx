import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stripeApi } from '@/features/stripe/api/stripeApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { StripeSettlements } from '@ledgercraft/contracts';

function PaymentActions({ payment }: { payment: StripeSettlements['items'][number] }) {
 const cache = useQueryClient(); const [reason,setReason] = useState(''); const [confirmed,setConfirmed] = useState(false); const [key] = useState(() => crypto.randomUUID());
 const verify = useMutation({ mutationFn: () => stripeApi.verify(payment.id), onSuccess: () => cache.invalidateQueries({queryKey:['stripe-operations']}) });
 const refund = useMutation({ mutationFn: () => stripeApi.refund(payment.id, reason, key), onSuccess: () => cache.invalidateQueries({queryKey:['stripe-operations']}) });
 return <li className="space-y-3 border-t border-border py-4"><p className="font-medium">NZD {payment.amount} · {payment.status}</p><p className="text-sm text-muted-foreground">{payment.paymentDate} · Platform fee NZD {payment.platformFee}</p>
 <Button variant="outline" disabled={verify.isPending} onClick={() => verify.mutate()}>Verify with Stripe</Button>
 {verify.data && <p role="status">{verify.data.result}{verify.data.differences.length ? `: ${verify.data.differences.join(', ')}` : ''}</p>}
 {payment.status === 'completed' && <fieldset className="space-y-3"><legend className="text-sm font-medium">Full refund</legend><label className="block space-y-2 text-sm">Full refund reason<Input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} /></label><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />I confirm a full Stripe refund and transfer reversal</label><Button variant="outline" disabled={!confirmed || reason.trim().length<8 || refund.isPending || refund.isSuccess} onClick={()=>refund.mutate()}>Request full refund</Button></fieldset>}
 {refund.isSuccess && <p role="status">Refund requested. Awaiting Stripe webhook confirmation.</p>}{(verify.error||refund.error) && <p role="alert" className="text-sm text-destructive">{(verify.error||refund.error)?.message}</p>}</li>;
}
export function StripeOperationsPanel() {
 const query = useQuery({queryKey:['stripe-operations'],queryFn:async()=>{const [balance,settlements,operations] = await Promise.all([stripeApi.balance(),stripeApi.settlements(),stripeApi.operations()]);return {balance,settlements,operations};},retry:false});
 if(query.isPending)return <p role="status">Loading Stripe balances and payments…</p>;
 if(query.error)return <div className="space-y-3"><p role="alert">{query.error.message}</p><Button variant="outline" onClick={()=>void query.refetch()}>Retry Stripe review</Button></div>;
 const {balance,settlements,operations}=query.data;
 return <section aria-label="Stripe balances and payment review" className="space-y-5"><h3 className="text-lg font-semibold">Stripe balances and payment review</h3><dl className="grid gap-3 sm:grid-cols-2">{([['Available',balance.available],['Pending',balance.pending],['Posted Stripe Clearing',balance.ledgerClearing],['Provider less posted clearing',balance.difference]] as const).map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">NZD {value}</dd></div>)}</dl>{balance.warnings.map(warning=><p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}<p className="text-xs text-muted-foreground">Latest 100 payments and audit records. Verification reads Stripe and records differences; it never corrects your books automatically.</p>{settlements.items.length ? <ul>{settlements.items.map(payment=><PaymentActions key={payment.id} payment={payment}/>)}</ul> : <p>No Stripe payments recorded yet.</p>}{operations.items.length>0&&<ul className="space-y-3">{operations.items.map(item=><li key={item.id} className="text-sm"><strong>{item.kind}: {item.result}</strong>{item.details.warning&&<p>{item.details.warning}</p>}</li>)}</ul>}</section>;
}
