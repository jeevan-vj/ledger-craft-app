import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { TaxReturnDto } from '@ledgercraft/contracts';
import { useStore } from '@/store';
import { ModernButton } from '@/components/ui/ModernButton';
import { gstWorkspaceApi } from '@/features/reports/api/gstWorkspaceApi';
import { formatMoney } from '@/utils/money';
import { space, useTheme } from '@/theme';
import { GstSettingsForm } from './GstSettingsForm';
import { GstReturnDetail } from './GstReturnDetail';
import { GstPreparationPanel } from './GstPreparationPanel';
const basisLabel = (basis: string | null) => basis === 'payments' ? 'Payments' : basis === 'hybrid' ? 'Hybrid' : basis === 'invoice' ? 'Invoice' : 'Not configured';
export function GstWorkspacePanel() {
 const theme = useTheme(); const permissions = useStore(state => state.permissions); const canSettings = permissions.includes('settings.write'); const canFile = permissions.includes('banking.write'); const canReopen = permissions.includes('organisations.update');
 const query = useQuery({ queryKey: ['gst', 'workspace'], queryFn: gstWorkspaceApi.periods }); const data = query.data;
 const [mutating, setBusy] = useState(false); const busy = mutating || query.isFetching; const [error, setError] = useState(''); const [editing, setEditing] = useState(false); const [saved, setSaved] = useState<TaxReturnDto>(); const [selected, setSelected] = useState<{ from: string; to: string }>();
 async function load() { setError(''); await query.refetch({ throwOnError: true }); }
 useEffect(() => { if (query.isPending) { setSaved(undefined); setSelected(undefined); setEditing(false); } }, [query.isPending]);
 const message = error || (query.error instanceof Error ? query.error.message : query.error ? 'GST workspace unavailable.' : '');
 async function view(id: string) { setBusy(true); setError(''); try { setSaved(await gstWorkspaceApi.getReturn(id)); setSelected(undefined); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Saved return unavailable.'); } finally { setBusy(false); } }
 return <View style={{ gap: space.lg }}>
  <Text style={theme.type.title}>GST settings and returns</Text>
  <Text style={theme.type.subhead}>Prepare and review your GST records here. Filing happens separately in myIR.</Text>
  {busy ? <ActivityIndicator accessibilityLabel="Loading GST workspace" color={theme.colors.accentText} /> : null}
  {message ? <><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{message}</Text><ModernButton onPress={() => { void load().catch(() => undefined); }}>Retry GST workspace</ModernButton></> : null}
  {data ? <>
   <Text style={theme.type.callout}>Registered basis: {basisLabel(data.settings.gstAccountingBasis)}</Text>
   <Text style={theme.type.body}>Registration: {data.settings.gstRegisteredFrom ?? 'Not configured'} · GST No: {data.settings.taxId ?? 'Not configured'}</Text>
   {[...new Set([...data.warnings, ...data.settings.warnings])].map(warning => <Text key={warning} accessibilityRole="alert" style={{ color: theme.colors.warning }}>{warning}</Text>)}
   {canSettings ? <ModernButton variant="secondary" disabled={busy} onPress={() => setEditing(!editing)}>{editing ? 'Close GST settings' : 'Edit GST settings'}</ModernButton> : null}
   {canSettings && (editing || !data.settings.configured) ? <GstSettingsForm settings={data.settings} onSaved={async () => { await load(); setEditing(false); setSaved(undefined); setSelected(undefined); }} /> : null}
   {data.settings.configured && !data.periods.length ? <Text style={theme.type.body}>No GST periods due</Text> : null}
   {data.periods.map(period => <View key={`${period.periodStart}-${period.periodEnd}`} style={{ gap: space.sm, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: theme.colors.separator }}>
    <Text style={theme.type.headline}>{period.periodStart} to {period.periodEnd}</Text><Text style={theme.type.body}>Due {period.dueDate}</Text>
    <Text style={[theme.type.callout, period.status === 'overdue' && { color: theme.colors.warning }]}>{period.status === 'filed' ? 'Filed externally' : period.status === 'reopened' ? 'Reopened' : period.status === 'draft' ? 'Draft' : period.status === 'overdue' ? 'Overdue' : 'Not started'}{period.netGst != null ? ` · ${formatMoney(period.netGst)}` : ''}{period.irdReference ? ` · ${period.irdReference}` : ''}</Text>
    {period.taxReturnId ? <ModernButton size="sm" variant="secondary" disabled={busy} onPress={() => void view(period.taxReturnId!)}>View saved return</ModernButton> : null}
    {canFile && period.status !== 'filed' ? <ModernButton size="sm" disabled={busy} onPress={() => { setSelected({ from: period.periodStart, to: period.periodEnd }); setSaved(undefined); }}>Prepare this GST period</ModernButton> : null}
   </View>)}
   {selected && data.settings.configured && data.settings.gstAccountingBasis ? <GstPreparationPanel key={`${selected.from}-${selected.to}-${data.settings.gstAccountingBasis}`} initialFrom={selected.from} initialTo={selected.to} registeredBasis={data.settings.gstAccountingBasis} onSaved={() => void load()} /> : null}
   {saved ? <GstReturnDetail key={`${saved.id}-${saved.updatedAt}-${saved.status}-${saved.supersededAt ?? ''}`} initial={saved} canFile={canFile} canReopen={canReopen} onFiled={load} /> : null}
   <ModernButton variant="secondary" disabled={busy} onPress={() => { void load().catch(() => undefined); }}>Refresh GST periods</ModernButton>
  </> : null}
 </View>;
}
