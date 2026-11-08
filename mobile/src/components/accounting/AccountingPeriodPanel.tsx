import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountingPeriodsApi } from '@/features/accounting/accountingPeriodsApi';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { useTheme, space } from '@/theme';
export function AccountingPeriodPanel() {
  const theme = useTheme(); const client = useQueryClient();
  const scope = useQuery({ queryKey: ['accounting', 'access'], queryFn: accountingPeriodsApi.access });
  const organisationId = scope.data?.organisation.id;
  const query = useQuery({ queryKey: ['accounting', 'periods', organisationId], queryFn: () => accountingPeriodsApi.get(organisationId!), enabled: Boolean(organisationId) });
  const [through, setThrough] = useState(''); const [from, setFrom] = useState('');
  const [closeReason, setCloseReason] = useState(''); const [reopenReason, setReopenReason] = useState('');
  const [closeReviewed, setCloseReviewed] = useState(false); const [reopenReviewed, setReopenReviewed] = useState(false); const [message, setMessage] = useState('');
  const close = useMutation({ retry: false, mutationFn: () => accountingPeriodsApi.close({ through, reason: closeReason.trim(), reviewed: true, expectedRevision: query.data!.revision }, organisationId!), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['accounting', 'periods'] }); setCloseReviewed(false); setMessage('Accounting period closed.'); } });
  const reopen = useMutation({ retry: false, mutationFn: () => accountingPeriodsApi.reopen({ from, reason: reopenReason.trim(), reviewed: true, expectedRevision: query.data!.revision }, organisationId!), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['accounting', 'periods'] }); setReopenReviewed(false); setMessage('Accounting period reopened.'); } });
  useEffect(() => { setThrough(''); setFrom(''); setCloseReason(''); setReopenReason(''); setCloseReviewed(false); setReopenReviewed(false); setMessage(''); }, [organisationId]);
  const busy = close.isPending || reopen.isPending;
  async function refresh() { setCloseReviewed(false); setReopenReviewed(false); setMessage(''); close.reset(); reopen.reset(); await query.refetch(); }
  if (scope.isPending || (organisationId && query.isPending)) return <ActivityIndicator accessibilityLabel="Loading accounting period" />;
  if (scope.error || query.error || !query.data) return <View style={{ gap: space.md }}><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{scope.error instanceof Error ? scope.error.message : query.error instanceof Error ? query.error.message : 'Accounting period unavailable.'}</Text><ModernButton onPress={() => { void scope.refetch(); void query.refetch(); }}>Retry accounting period</ModernButton></View>;
  const state = query.data;
  return <View style={{ gap: space.md }}>
    <Text style={theme.type.headline}>Accounting period protection</Text>
    <Text style={theme.type.body}>{state.closedThrough ? `Transactions dated on or before ${state.closedThrough} are protected.` : 'No accounting cutoff is closed.'}</Text>
    <Text style={theme.type.subhead}>Review the trial balance, reports, bank statements and GST before closing. Closing protects historical financial changes; reports and exports remain available.</Text>
    <ModernButton variant="secondary" disabled={busy} onPress={() => void refresh()}>Refresh accounting period</ModernButton>
    {state.canClose ? <>
      <ModernInput label="Close accounting through" placeholder="YYYY-MM-DD" value={through} editable={!busy} onChangeText={value => { setThrough(value); setCloseReviewed(false); }} />
      <ModernInput label="Accounting close reason" value={closeReason} editable={!busy} onChangeText={value => { setCloseReason(value); setCloseReviewed(false); }} />
      <Text style={theme.type.body}>I have reviewed the reports, bank reconciliation and GST for this cutoff.</Text>
      <Switch accessibilityLabel="Confirm accounting close reviewed" value={closeReviewed} disabled={busy} onValueChange={setCloseReviewed} />
      <ModernButton disabled={busy || !closeReviewed || !through || closeReason.trim().length < 8} loading={close.isPending} onPress={() => { setMessage(''); close.mutate(); }}>Close accounting period</ModernButton>
    </> : <Text style={theme.type.subhead}>Closing requires owner, administrator or accountant access.</Text>}
    {state.closedThrough ? state.canReopen ? <>
      <ModernInput label="Reopen accounting from" placeholder="YYYY-MM-DD" value={from} editable={!busy} onChangeText={value => { setFrom(value); setReopenReviewed(false); }} />
      <ModernInput label="Accounting reopen reason" value={reopenReason} editable={!busy} onChangeText={value => { setReopenReason(value); setReopenReviewed(false); }} />
      <Text style={theme.type.body}>I understand this permits changes from the selected date and retains an audit record.</Text>
      <Switch accessibilityLabel="Confirm accounting reopen reviewed" value={reopenReviewed} disabled={busy} onValueChange={setReopenReviewed} />
      <ModernButton variant="secondary" disabled={busy || !reopenReviewed || !from || reopenReason.trim().length < 8} loading={reopen.isPending} onPress={() => { setMessage(''); reopen.mutate(); }}>Reopen accounting period</ModernButton>
    </> : <Text style={theme.type.subhead}>Reopening requires an owner or administrator.</Text> : null}
    {close.error || reopen.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{(close.error || reopen.error)?.message}</Text> : null}
    {message ? <Text style={theme.type.body}>{message}</Text> : null}
    <Text style={theme.type.headline}>Period audit history</Text>
    {!state.events.length ? <Text style={theme.type.subhead}>No period changes recorded.</Text> : state.events.map(event => <View key={event.id} style={{ gap: space.xs }}><Text style={theme.type.callout}>{event.action === 'close' ? 'Closed' : 'Reopened'} · {event.newClosedThrough ? `Protected through ${event.newClosedThrough}` : 'No closed cutoff'}</Text><Text style={theme.type.body}>{event.reason}</Text><Text selectable style={theme.type.caption}>{event.createdAt} · Actor {event.actorId} · Revision {event.revision}</Text></View>)}
  </View>;
}
