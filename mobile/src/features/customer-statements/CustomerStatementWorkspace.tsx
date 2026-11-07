import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Share,Switch,Text,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {customerStatementQuerySchema,reportDatePreset,type CustomerStatementQuery} from '@ledgercraft/contracts';
import {useStore} from '@/store';
import {space,useTheme} from '@/theme';
import {FormInput} from '@/components/ui/FormInput';
import {ModernButton} from '@/components/ui/ModernButton';
import {SelectionSheet,SelectionRow} from '@/components/ui/SelectionSheet';
import {randomId} from '@/utils/id';
import {collectionsApi} from './collectionsApi';
import {shareStatementPdf} from './statementDocument';
import {CustomerReminderPreference} from './PaymentRemindersWorkspace';
export function CustomerStatementWorkspace({initialCustomerId,initialPeriod}:{initialCustomerId?:string;initialPeriod?:{from:string;to:string}}={}){
 const theme=useTheme(),permissions=useStore(s=>s.permissions),canSend=permissions.includes('banking.write');
 const customers=useQuery({queryKey:['customer-statements','customers'],queryFn:collectionsApi.customers});
 const capability=useQuery({queryKey:['customer-statements','reminder-settings'],queryFn:collectionsApi.reminders});
 const [customerId,setCustomer]=useState(initialCustomerId??''),[period,setPeriod]=useState(initialPeriod??reportDatePreset('last_month'));
 const [type,setType]=useState<CustomerStatementQuery['type']>('activity'),[prepared,setPrepared]=useState<{id:string;query:CustomerStatementQuery}>();
 const statement=useQuery({queryKey:['customer-statements','statement',prepared],queryFn:()=>collectionsApi.statement(prepared!.id,prepared!.query),enabled:!!prepared});
 const [picker,setPicker]=useState(false),[search,setSearch]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[link,setLink]=useState('');
 const [selected,setSelected]=useState<string[]>([]),[bulkMode,setBulk]=useState(false);const attempts=useRef(new Map<string,string>()),lock=useRef(false);
 const key=(scope:string)=>{const fingerprint=JSON.stringify([scope,prepared,scope==='bulk'?[...selected].sort():undefined]);if(!attempts.current.has(fingerprint))attempts.current.set(fingerprint,randomId());return attempts.current.get(fingerprint)!;};
 function invalidate(){setPrepared(undefined);setLink('');setNotice('');setError('');}
 useEffect(()=>{if(customers.isPending){setPrepared(undefined);setLink('');setSelected([]);setNotice('');attempts.current.clear();}},[customers.isPending]);
 function prepare(){try{const parsed=customerStatementQuerySchema.safeParse({...period,type});if(!parsed.success)throw new Error(parsed.error.issues[0]?.message??'Choose a valid statement period.');const query=parsed.data;if(!customerId)throw new Error('Choose a customer first.');setPrepared({id:customerId,query});setError('');setLink('');setNotice('');}catch(caught){setError(caught instanceof Error?caught.message:'Review the statement dates.');}}
 async function action(run:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await run();}catch(caught){setError(caught instanceof Error?caught.message:'This action could not be completed. Try again.');}finally{lock.current=false;setBusy(false);}}
 const value=statement.data;const current=customers.data?.find(c=>c.id===customerId);const filtered=customers.data?.filter(c=>`${c.name} ${c.email}`.toLowerCase().includes(search.toLowerCase()))??[];
 const message=error||(customers.error instanceof Error?customers.error.message:'')||(statement.error instanceof Error?statement.error.message:'');
 return <View style={{gap:space.lg}}>
  <Text style={theme.type.title}>Customer statements</Text><Text style={theme.type.subhead}>Review posted customer activity, outstanding invoices and aging in company-base NZD.</Text>
  {customers.isPending?<ActivityIndicator accessibilityLabel="Loading statement customers" color={theme.colors.accentText}/>:null}
  {message?<><Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{message}</Text>{customers.isError?<ModernButton onPress={()=>void customers.refetch()}>Retry customers</ModernButton>:statement.isError?<ModernButton onPress={()=>void statement.refetch()}>Retry statement</ModernButton>:null}</>:null}
  {customers.data?.length===0?<Text style={theme.type.body}>No customers yet. Add a customer before preparing a statement.</Text>:null}
  {customers.data?.length?<>
   <Text style={theme.type.headline}>{current?.name??'Choose a customer'}</Text><ModernButton variant="secondary" onPress={()=>setPicker(true)}>Choose statement customer</ModernButton>
   <FormInput label="Statement start" accessibilityLabel="Statement start" value={period.from} autoCapitalize="none" onChangeText={from=>{setPeriod(p=>({...p,from}));invalidate();}}/>
   <FormInput label="Statement end" accessibilityLabel="Statement end" value={period.to} autoCapitalize="none" onChangeText={to=>{setPeriod(p=>({...p,to}));invalidate();}}/>
   <ModernButton variant="secondary" onPress={()=>{setType(type==='activity'?'open_items':'activity');invalidate();}}>{type==='activity'?'Activity statement':'Open-items statement'}</ModernButton>
   <ModernButton disabled={busy||!customerId||statement.isFetching} onPress={prepare}>Prepare customer statement</ModernButton>
   {statement.isFetching?<ActivityIndicator accessibilityLabel="Loading customer statement" color={theme.colors.accentText}/>:null}
   {value?<>
    <Text style={theme.type.headline}>{value.customer.name} · {value.from} to {value.to}</Text>
    <Text style={theme.type.body}>Opening balance: NZD {value.openingBalance}</Text><Text style={theme.type.title}>Closing balance: NZD {value.closingBalance}</Text>
    {!value.lines.length?<Text style={theme.type.body}>No statement movements in this period.</Text>:null}
    {value.lines.map(line=><View key={line.id} style={{gap:space.xs,paddingVertical:space.md,borderBottomWidth:1,borderBottomColor:theme.colors.separator}}><Text style={theme.type.callout}>{line.date} · {line.reference}</Text><Text style={theme.type.body}>{line.description}</Text><Text style={theme.type.footnote}>Debit NZD {line.debit} · Credit NZD {line.credit}</Text><Text style={theme.type.callout}>Running balance: NZD {line.runningBalance}</Text></View>)}
    <Text style={theme.type.headline}>Receivables aging</Text>{([['Current',value.aging.current],['1–30 days',value.aging.days1To30],['31–60 days',value.aging.days31To60],['61–90 days',value.aging.days61To90],['Over90 days',value.aging.over90],['Unallocated balance',value.aging.unallocatedControl]]as const).map(([label,amount])=><Text key={label} style={theme.type.body}>{label}: NZD {amount}</Text>)}
    {value.warnings.map(w=><Text key={w} style={{color:theme.colors.warning}}>{w}</Text>)}
    <ModernButton variant="secondary" disabled={busy} onPress={()=>void action(()=>shareStatementPdf(value))}>Share statement PDF</ModernButton>
    {canSend&&prepared?<>
     <ModernButton variant="secondary" disabled={busy} onPress={()=>void action(async()=>{const shared=await collectionsApi.share(prepared.id,prepared.query);setLink(shared.url);setNotice(`Secure statement link created. Expires ${shared.expiresAt.slice(0,10)}.`);})}>Create secure statement link</ModernButton>
     {link?<><Text selectable style={theme.type.footnote}>{link}</Text><ModernButton variant="secondary" disabled={busy} onPress={()=>void action(async()=>{await Share.share({message:link});})}>Share statement link</ModernButton><ModernButton variant="secondary" disabled={busy} onPress={()=>void action(async()=>{await collectionsApi.revoke(prepared.id);setLink('');setNotice('All statement links for this customer were revoked.');})}>Revoke customer statement links</ModernButton></>:null}
     {capability.data?.emailAvailable?<ModernButton disabled={busy||notice==='Statement email accepted.'} onPress={()=>void action(async()=>{await collectionsApi.send(prepared.id,prepared.query,key('single'));setNotice('Statement email accepted.');})}>Send statement email</ModernButton>:capability.isPending?<Text style={theme.type.footnote}>Checking email delivery settings…</Text>:capability.isError?<><Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{capability.error instanceof Error?capability.error.message:'Email delivery settings could not be loaded.'}</Text><ModernButton variant="secondary" onPress={()=>void capability.refetch()}>Retry delivery settings</ModernButton></>:<Text style={{color:theme.colors.warning}}>Email delivery is unavailable. Download the PDF or share a secure link.</Text>}
     <CustomerReminderPreference customerId={prepared.id}/>
     {capability.data?.emailAvailable?<><View style={{flexDirection:'row',alignItems:'center',gap:space.md}}><Switch accessibilityLabel="Choose customers for bulk statements" value={bulkMode} onValueChange={setBulk}/><Text style={theme.type.body}>Bulk statement emails</Text></View>{bulkMode?<>{customers.data.map(c=><View key={c.id} style={{flexDirection:'row',alignItems:'center',gap:space.md}}><Switch accessibilityLabel={`Send statement to ${c.name}`} value={selected.includes(c.id)} onValueChange={on=>setSelected(ids=>on?[...ids,c.id]:ids.filter(id=>id!==c.id))}/><Text style={[theme.type.body,{flex:1}]}>{c.name}</Text></View>)}<ModernButton disabled={busy||!selected.length} onPress={()=>void action(async()=>{const result=await collectionsApi.bulk(selected,prepared.query,key('bulk'));setNotice(`Statements: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped.`);})}>Send selected customer statements</ModernButton></>:null}</>:null}
    </>:null}
   </>:null}
  </>:null}
  {notice?<Text accessibilityRole="alert" style={{color:theme.colors.success}}>{notice}</Text>:null}
  <SelectionSheet visible={picker} title="Statement customer" searchPlaceholder="Search statement customers" searchQuery={search} onSearchChange={setSearch} onClose={()=>setPicker(false)} loading={customers.isPending} empty={!filtered.length} emptyTitle="No matching customers">{filtered.map(c=><SelectionRow key={c.id} title={c.name} subtitle={c.email} selected={customerId===c.id} onPress={()=>{setCustomer(c.id);setPicker(false);invalidate();}}/>)}</SelectionSheet>
 </View>;
}
