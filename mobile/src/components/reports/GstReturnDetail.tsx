import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { TaxReturnDto } from '@ledgercraft/contracts';
import { gstWorkspaceApi } from '@/features/reports/api/gstWorkspaceApi';
import { shareGstReturn } from '@/features/reports/model/gstReturnDocument';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { formatMoney } from '@/utils/money';
import { space, useTheme } from '@/theme';
export function GstReturnDetail({ initial, canFile, canReopen = false, onFiled }: { initial: TaxReturnDto; canFile: boolean; canReopen?: boolean; onFiled: () => Promise<void> }) {
 const theme = useTheme(); const [saved, setSaved] = useState(initial); const [reference, setReference] = useState(''); const [reviewed, setReviewed] = useState(false); const [reopenReason, setReopenReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
 async function file() {
  if (!reference.trim()) { setError('Enter the confirmation reference from your completed myIR filing.'); return; }
  if (!reviewed) { setError('Confirm that you completed this filing externally in myIR.'); return; }
  setBusy(true); setError('');
  try { setSaved(await gstWorkspaceApi.fileReturn(saved.id, reference.trim())); await onFiled(); }
  catch (caught) { setError(caught instanceof Error ? caught.message : 'Filing record could not be saved.'); }
  finally { setBusy(false); }
 }
 async function reopen() {
  if (!canReopen || !reopenReason.trim() || saved.supersededAt) { setError('Enter a reason for reopening this filed period.'); return; }
  setBusy(true); setError('');
  try { setSaved(await gstWorkspaceApi.reopen(saved.id, reopenReason.trim())); setReopenReason(''); await onFiled(); }
  catch (caught) { setError(caught instanceof Error ? caught.message : 'The filed period could not be reopened.'); }
  finally { setBusy(false); }
 }
 async function share() { setBusy(true); setError(''); try { await shareGstReturn(saved); } catch (caught) { setError(caught instanceof Error ? caught.message : 'GST PDF could not be shared.'); } finally { setBusy(false); } }
 return <View style={{ gap: space.md }}>
  <Text style={theme.type.headline}>Saved GST return · {saved.periodStart} to {saved.periodEnd}</Text>
  <Text style={theme.type.body}>Saved total sales: {formatMoney(saved.totalSales)}</Text><Text style={theme.type.body}>Saved total purchases: {formatMoney(saved.totalPurchases)}</Text>
  <Text style={theme.type.body}>Saved GST on sales: {formatMoney(saved.gstOnSales)}</Text><Text style={theme.type.body}>Saved GST on purchases: {formatMoney(saved.gstOnPurchases)}</Text>
  <Text style={theme.type.headline}>Saved net GST: {formatMoney(saved.netGst)}</Text>
  <Text style={theme.type.subhead}>{saved.supersededAt ? 'Filed snapshot superseded' : saved.status === 'submitted' || saved.status === 'approved' ? `Filed externally · ${saved.irdReference ?? 'Reference unavailable'}` : 'Draft preparation — not filed'}</Text>
  {saved.supersededAt ? <Text style={theme.type.body}>This filed snapshot is kept{saved.reopenReason ? `: ${saved.reopenReason}` : ''}. Prepare a new draft to record a replacement filing.</Text> : null}
  <Text style={theme.type.caption}>EasyBizInvoice does not submit GST returns to IRD. File in myIR first, then record its confirmation reference here.</Text>
  {(saved.status === 'submitted' || saved.status === 'approved') && !saved.supersededAt && canReopen ? <>
   <ModernInput label="Reason for reopening" value={reopenReason} onChangeText={setReopenReason} editable={!busy} />
   <ModernButton disabled={busy} loading={busy} onPress={() => void reopen()}>Reopen filed period</ModernButton>
  </> : null}
  {saved.status === 'draft' && canFile ? <>
   <ModernInput label="myIR confirmation reference" value={reference} onChangeText={setReference} editable={!busy} />
   <Text style={theme.type.body}>This is a record of filing you already completed in myIR.</Text>
   <Switch accessibilityLabel="Confirm this return was filed externally in myIR" value={reviewed} onValueChange={setReviewed} disabled={busy} />
   <ModernButton disabled={busy} loading={busy} onPress={() => void file()}>Record external filing</ModernButton>
  </> : null}
  <ModernButton variant="secondary" disabled={busy} onPress={() => void share()}>Share GST preparation PDF</ModernButton>
  {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
 </View>;
}
