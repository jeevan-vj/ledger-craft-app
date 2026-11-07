import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Switch,Text,View} from 'react-native';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {reminderSettingsRequestSchema,type ReminderSettingsRequest} from '@ledgercraft/contracts';
import {useStore} from '@/store';
import {space,useTheme} from '@/theme';
import {FormInput} from '@/components/ui/FormInput';
import {ModernButton} from '@/components/ui/ModernButton';
import {randomId} from '@/utils/id';
import {collectionsApi,type MobileReminderSettings} from './collectionsApi';
const errorMessage=(value:unknown)=>value instanceof Error?value.message:'Check your connection and try again.';
export function PaymentRemindersWorkspace(){
 const theme=useTheme(),permissions=useStore(s=>s.permissions),canWrite=permissions.includes('settings.write');
 const query=useQuery({queryKey:['customer-statements','reminder-settings'],queryFn:collectionsApi.reminders});const [notice,setNotice]=useState('');useEffect(()=>{if(query.isPending)setNotice('');},[query.isPending]);
 return <View style={{gap:space.lg}}><Text style={theme.type.title}>Automatic payment reminders</Text><Text style={theme.type.subhead}>Schedule reviewed reminders relative to invoice due dates. Paid, cancelled, draft and opted-out invoices are excluded.</Text>
  {query.isPending?<ActivityIndicator accessibilityLabel="Loading automatic reminder settings" color={theme.colors.accentText}/>:null}
  {query.isError?<><Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{errorMessage(query.error)}</Text><ModernButton onPress={()=>void query.refetch()}>Retry reminder settings</ModernButton></>:null}
  {query.data?<ReminderSettingsForm key={JSON.stringify(query.data)} initial={query.data} canWrite={canWrite} onSaved={async()=>{await query.refetch({throwOnError:true});setNotice('Reminder settings saved.');}}/>:null}
  {notice?<Text accessibilityRole="alert" style={{color:theme.colors.success}}>{notice}</Text>:null}
 </View>;
}
function ReminderSettingsForm({initial,canWrite,onSaved}:{initial:MobileReminderSettings;canWrite:boolean;onSaved:()=>Promise<unknown>}){
 const theme=useTheme();const [enabled,setEnabled]=useState(initial.enabled),[timeZone,setZone]=useState(initial.timeZone),[localTime,setTime]=useState(initial.localTime);
 const [steps,setSteps]=useState(initial.steps.map(v=>({...v,offset:String(v.offsetDays)}))),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function edit(index:number,patch:Partial<(typeof steps)[number]>){setSteps(rows=>rows.map((v,i)=>i===index?{...v,...patch}:v));setReviewed(false);}
 async function save(){if(!canWrite||busy||!reviewed)return;setBusy(true);setError('');try{if(steps.some(s=>!/^[-]?\d+$/.test(s.offset)))throw new Error('Each reminder offset must be a whole number of days.');const parsed=reminderSettingsRequestSchema.safeParse({enabled,timeZone,localTime,steps:steps.map(({offset,...v})=>({...v,offsetDays:Number(offset),subject:v.subject?.trim()||undefined,message:v.message?.trim()||undefined}))});if(!parsed.success)throw new Error(parsed.error.issues[0]?.message??'Review the reminder settings.');await collectionsApi.saveReminders(parsed.data);setReviewed(false);await onSaved();}catch(caught){setError(errorMessage(caught));}finally{setBusy(false);}}
 return <View style={{gap:space.lg}}>
  {initial.warnings.map(v=><Text key={v} style={{color:theme.colors.warning}}>{v}</Text>)}
  {!canWrite?<Text style={theme.type.body}>Read-only settings. An owner or administrator must change automatic reminder schedules.</Text>:null}
  <View style={{flexDirection:'row',alignItems:'center',gap:space.md}}><Switch accessibilityLabel="Enable automatic payment reminders" value={enabled} disabled={!canWrite||busy} onValueChange={v=>{setEnabled(v);setReviewed(false);}}/><Text style={theme.type.body}>Automatic reminders {enabled?'on':'off'}</Text></View>
  <FormInput label="Reminder timezone" accessibilityLabel="Reminder timezone" value={timeZone} editable={canWrite&&!busy} autoCapitalize="none" onChangeText={v=>{setZone(v);setReviewed(false);}}/>
  <FormInput label="Reminder local time (HH:MM)" accessibilityLabel="Reminder local time" value={localTime} editable={canWrite&&!busy} onChangeText={v=>{setTime(v);setReviewed(false);}}/>
  <Text style={theme.type.footnote}>Negative offsets send before the due date, zero on the due date, and positive offsets after it. Existing step IDs retain their delivery history. Missed historical steps are not backfilled.</Text>
  {steps.map((step,index)=><View key={step.id} style={{gap:space.md,paddingVertical:space.md,borderBottomWidth:1,borderBottomColor:theme.colors.separator}}>
   <Text style={theme.type.headline}>Reminder step {index+1}</Text>
   <FormInput label={`Offset days ${index+1}`} accessibilityLabel={`Reminder offset ${index+1}`} value={step.offset} editable={canWrite&&!busy} keyboardType="numbers-and-punctuation" onChangeText={offset=>edit(index,{offset})}/>
   <ModernButton variant="secondary" disabled={!canWrite||busy} onPress={()=>{const next:ReminderSettingsRequest['steps'][number]['reminderType']=step.reminderType==='gentle'?'firm':step.reminderType==='firm'?'final':'gentle';edit(index,{reminderType:next});}}>Reminder tone {index+1}: {step.reminderType}</ModernButton>
   <FormInput label={`Email subject ${index+1} (optional)`} accessibilityLabel={`Reminder subject ${index+1}`} value={step.subject??''} editable={canWrite&&!busy} onChangeText={subject=>edit(index,{subject})}/>
   <FormInput label={`Email message ${index+1} (optional)`} accessibilityLabel={`Reminder message ${index+1}`} value={step.message??''} editable={canWrite&&!busy} multiline onChangeText={message=>edit(index,{message})}/>
   {canWrite?<ModernButton variant="secondary" disabled={busy||steps.length<=1} onPress={()=>{setSteps(rows=>rows.filter(v=>v.id!==step.id));setReviewed(false);}}>Remove reminder step {index+1}</ModernButton>:null}
  </View>)}
  <Text style={theme.type.footnote}>{'Available placeholders: {customer}, {invoiceNumber}, {amountDue}, {dueDate}, {payLink}.'}</Text>
  {canWrite?<><ModernButton variant="secondary" disabled={busy||steps.length>=10} onPress={()=>{setSteps(rows=>[...rows,{id:`step-${randomId().slice(0,8)}`,offsetDays:7,offset:'7',reminderType:'firm'}]);setReviewed(false);}}>Add reminder step</ModernButton><View style={{flexDirection:'row',alignItems:'center',gap:space.md}}><Switch accessibilityLabel="I reviewed the reminder schedule and customer preferences" value={reviewed} disabled={busy} onValueChange={setReviewed}/><Text style={[theme.type.body,{flex:1}]}>I reviewed the schedule and customer preferences</Text></View><ModernButton disabled={busy||!reviewed} onPress={()=>void save()}>{busy?'Saving reminder settings…':'Save automatic reminder settings'}</ModernButton></>:null}
  {error?<Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{error}</Text>:null}
 </View>;
}
function ReminderPreference({kind,id}:{kind:'customer'|'invoice';id:string}){
 const theme=useTheme(),canWrite=useStore(s=>s.permissions).includes('banking.write'),client=useQueryClient();const key=['customer-statements','preference',kind,id];
 const query=useQuery({queryKey:key,queryFn:()=>collectionsApi.optOut(kind,id)});const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function change(optOut:boolean){if(!canWrite||busy)return;setBusy(true);setError('');try{const value=await collectionsApi.setOptOut(kind,id,optOut);client.setQueryData(key,value);}catch(caught){setError(errorMessage(caught));}finally{setBusy(false);}}
 return <View style={{gap:space.sm}}>{query.isPending?<ActivityIndicator accessibilityLabel={`Loading ${kind} reminder preference`} color={theme.colors.accentText}/>:null}{query.data?<View style={{flexDirection:'row',alignItems:'center',gap:space.md}}><Switch accessibilityLabel={`Exclude this ${kind} from automatic reminders`} value={query.data.optOut} disabled={!canWrite||busy} onValueChange={v=>void change(v)}/><Text style={[theme.type.body,{flex:1}]}>Exclude this {kind} from automatic reminders</Text></View>:null}{error||query.isError?<><Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{error||errorMessage(query.error)}</Text><ModernButton variant="secondary" onPress={()=>void query.refetch()}>Retry reminder preference</ModernButton></>:null}</View>;
}
export function CustomerReminderPreference({customerId}:{customerId:string}){return <ReminderPreference kind="customer" id={customerId}/>;}
export function InvoiceReminderPanel({invoiceId}:{invoiceId:string}){
 const theme=useTheme();const logs=useQuery({queryKey:['customer-statements','reminder-log',invoiceId],queryFn:()=>collectionsApi.logs(invoiceId)});
 return <View style={{gap:space.md}}><Text style={theme.type.headline}>Automatic reminder history</Text><ReminderPreference kind="invoice" id={invoiceId}/>{logs.isPending?<ActivityIndicator accessibilityLabel="Loading invoice reminder history" color={theme.colors.accentText}/>:null}{logs.isError?<><Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{errorMessage(logs.error)}</Text><ModernButton variant="secondary" onPress={()=>void logs.refetch()}>Retry reminder history</ModernButton></>:null}{logs.data&&!logs.data.logs.length?<Text style={theme.type.body}>No automatic reminder steps recorded.</Text>:null}{logs.data?.logs.map(log=><View key={log.id} style={{gap:space.xs,paddingVertical:space.md}}><Text style={theme.type.callout}>{log.stepId} · {log.status}</Text><Text style={theme.type.footnote}>Scheduled {log.scheduledDate} · {log.sentAt??log.createdAt}</Text>{log.reason?<Text style={{color:theme.colors.warning}}>{log.reason.replaceAll('_',' ')}</Text>:null}{log.status==='sending'?<Text style={{color:theme.colors.warning}}>Delivery is in progress or uncertain. Review its outcome before sending another reminder.</Text>:null}</View>)}</View>;
}
