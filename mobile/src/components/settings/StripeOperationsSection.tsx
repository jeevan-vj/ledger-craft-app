import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StripeSettlements } from '@ledgercraft/contracts';
import { ModernButton, ModernInput } from '@/components/ui';
import { AppPressable } from '@/components/ui/AppPressable';
import { stripeApi } from '@/features/stripe/api/stripeApi';
import { useTheme, space } from '@/theme';
import { randomId } from '@/utils/id';
function PaymentActions({payment}:{payment:StripeSettlements['items'][number]}){
 const theme=useTheme();const cache=useQueryClient();const [reason,setReason]=useState('');const [confirmed,setConfirmed]=useState(false);const [key]=useState(randomId);
 const verify=useMutation({mutationFn:()=>stripeApi.verify(payment.id),onSuccess:()=>cache.invalidateQueries({queryKey:['stripe-operations']})});
 const refund=useMutation({mutationFn:()=>stripeApi.refund(payment.id,reason,key),onSuccess:()=>cache.invalidateQueries({queryKey:['stripe-operations']})});
 return <View style={{gap:space.md,paddingVertical:space.md}}><Text style={[theme.type.headline,{color:theme.colors.text}]}>NZD {payment.amount} · {payment.status}</Text><Text style={[theme.type.footnote,{color:theme.colors.textSecondary}]}>{payment.paymentDate} · Platform fee NZD {payment.platformFee}</Text><ModernButton variant="outline" loading={verify.isPending} onPress={()=>verify.mutate()}>Verify with Stripe</ModernButton>
 {verify.data&&<Text style={{color:theme.colors.text}}>{verify.data.result}{verify.data.differences.length?`: ${verify.data.differences.join(', ')}`:''}</Text>}
 {payment.status==='completed'&&<><ModernInput label="Full refund reason" value={reason} onChangeText={setReason} maxLength={500}/><AppPressable accessibilityRole="checkbox" accessibilityState={{checked:confirmed}} accessibilityLabel="I confirm a full Stripe refund and transfer reversal" onPress={()=>setConfirmed(value=>!value)} style={{minHeight:48,justifyContent:'center'}}><Text style={[theme.type.body,{color:theme.colors.text}]}>{confirmed?'Confirmed: ':''}I confirm a full Stripe refund and transfer reversal</Text></AppPressable><ModernButton variant="outline" disabled={!confirmed||reason.trim().length<8||refund.isPending||refund.isSuccess} loading={refund.isPending} onPress={()=>refund.mutate()}>Request full refund</ModernButton></>}
 {refund.isSuccess&&<Text style={{color:theme.colors.text}}>Refund requested. Awaiting Stripe webhook confirmation.</Text>}{(verify.error||refund.error)&&<Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{(verify.error||refund.error)?.message}</Text>}</View>;
}
export function StripeOperationsSection(){
 const theme=useTheme();const query=useQuery({queryKey:['stripe-operations'],queryFn:async()=>{const [balance,settlements,operations]=await Promise.all([stripeApi.balance(),stripeApi.settlements(),stripeApi.operations()]);return {balance,settlements,operations};},retry:false});
 if(query.isPending)return <Text style={{color:theme.colors.text}}>Loading Stripe balances and payments…</Text>;
 if(query.error)return <View style={{gap:space.md}}><Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{query.error.message}</Text><ModernButton variant="outline" onPress={()=>void query.refetch()}>Retry Stripe review</ModernButton></View>;
 const {balance,settlements,operations}=query.data;
 return <View style={{gap:space.md}}><Text style={[theme.type.headline,{color:theme.colors.text}]}>Stripe balances and payment review</Text>{([['Available',balance.available],['Pending',balance.pending],['Posted Stripe Clearing',balance.ledgerClearing],['Provider less posted clearing',balance.difference]] as const).map(([label,value])=><Text key={label} style={[theme.type.body,{color:theme.colors.text}]}>{label}: NZD {value}</Text>)}{balance.warnings.map(warning=><Text key={warning} style={[theme.type.footnote,{color:theme.colors.textSecondary}]}>{warning}</Text>)}<Text style={[theme.type.footnote,{color:theme.colors.textSecondary}]}>Latest 100 payments and audit records. Verification never changes your books automatically.</Text>{settlements.items.length?settlements.items.map(payment=><PaymentActions key={payment.id} payment={payment}/>):<Text style={{color:theme.colors.text}}>No Stripe payments recorded yet.</Text>}{operations.items.map(item=><View key={item.id}><Text style={{color:theme.colors.text}}>{item.kind}: {item.result}</Text>{item.details.warning&&<Text style={{color:theme.colors.textSecondary}}>{item.details.warning}</Text>}</View>)}</View>;
}
