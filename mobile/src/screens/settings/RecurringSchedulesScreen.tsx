import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { EmptyState, GroupedSection, ListRow, ModernButton } from '@/components/ui';
import { recurringService, type RecurringRun, type RecurringTemplate } from '@/services/recurringService';
import { getServerCapabilities } from '@/services/capabilitiesService';
import { RecurringTemplateEditor } from '@/features/recurring/RecurringTemplateEditor';
import { useStore } from '@/store';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';
import type { MoreStackParamList, MainTabParamList } from '@/navigation/types';
import { invoiceTabParams } from '@/navigation/links';

export default function RecurringSchedulesScreen() {
  const { bottomPadding } = useTabScreenInsets();
  const theme = useTheme(); const client = useQueryClient(); const navigation = useNavigation<NavigationProp<MoreStackParamList>>();
  const permissions = useStore(s => s.permissions); const canWrite = permissions.includes('settings.write');
  const [editing, setEditing] = useState<RecurringTemplate | 'new' | undefined>();
  const templates = useQuery({ queryKey: ['recurring', 'templates'], queryFn: recurringService.list });
  const runs = useQuery({ queryKey: ['recurring', 'runs'], queryFn: recurringService.runs });
  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: getServerCapabilities });
  const action = useMutation({ networkMode: 'always', mutationFn: ({ id, kind }: { id: string; kind: 'pause' | 'resume' | 'end' }) => recurringService.action(id, kind), onSuccess: () => client.invalidateQueries({ queryKey: ['recurring'] }) });
  function open(run: RecurringRun) {
    if (!run.generatedId) return;
    if (run.generatedType === 'invoice') navigation.getParent<NavigationProp<MainTabParamList>>()?.navigate('Invoices', invoiceTabParams({ name: 'InvoiceDetail', params: { invoiceId: run.generatedId } }));
    if (run.generatedType === 'bill') navigation.navigate('BillDetail', { billId: run.generatedId });
  }
  function end(item: RecurringTemplate) { Alert.alert('End this schedule?', 'Future runs stop permanently. Generated documents remain in your books.', [{ text: 'Cancel', style: 'cancel' }, { text: 'End schedule', style: 'destructive', onPress: () => action.mutate({ id: item.id, kind: 'end' }) }]); }
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{ backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: space.screen, paddingBottom: bottomPadding, gap: space.lg }}>
    <Text style={theme.type.subhead}>Invoice, supplier-bill, income and expense schedules run on the server. Pausing stops future generation; existing documents remain unchanged.</Text>
    {editing ? <RecurringTemplateEditor key={editing === 'new' ? 'new' : editing.id} value={editing === 'new' ? undefined : editing} emailAvailable={capabilities.data?.email === 'available'} onClose={() => setEditing(undefined)} /> : <ModernButton onPress={() => setEditing('new')} disabled={!canWrite}>New schedule</ModernButton>}
    {!canWrite && <Text style={theme.type.footnote}>Read-only schedules. An owner, administrator or accountant must manage templates.</Text>}
    {templates.isLoading && <ActivityIndicator accessibilityLabel="Loading schedules" color={theme.colors.accent} />}
    {templates.error ? <EmptyState title="Schedules could not be loaded" description={templates.error.message} actionLabel="Try again" onAction={() => void templates.refetch()} /> : templates.data?.templates.length === 0 ? <EmptyState title="No recurring schedules" description="Create an invoice, bill, income or expense schedule to get started." /> : templates.data?.templates.map(item => <GroupedSection key={item.id} title={item.name}>
      <ListRow label={`${item.kind} · ${item.status}`} subtitle={`${item.schedule.frequency} every ${item.schedule.interval} · ${item.schedule.timezone}`} value={`${item.occurrencesCreated} created`} showChevron={false} />
      <Text style={[theme.type.footnote, { paddingHorizontal: space.lg, paddingBottom: space.md }]}>{item.nextRunAt ? `Next run ${new Date(item.nextRunAt).toLocaleString()} (${item.schedule.timezone})` : 'No future runs'}</Text>
      {canWrite && item.status !== 'ended' && <View style={{ padding: space.md, gap: space.sm }}><ModernButton variant="secondary" onPress={() => setEditing(item)}>Edit {item.name}</ModernButton><ModernButton variant="secondary" loading={action.isPending && action.variables?.id === item.id} onPress={() => action.mutate({ id: item.id, kind: item.status === 'active' ? 'pause' : 'resume' })}>{item.status === 'active' ? 'Pause future runs' : 'Resume future runs'}</ModernButton><ModernButton variant="secondary" onPress={() => end(item)}>End schedule</ModernButton></View>}
    </GroupedSection>)}
    {action.error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{action.error.message}</Text>}
    <Text style={theme.type.headline}>Run history</Text>
    {runs.error ? <EmptyState title="Run history unavailable" description={runs.error.message} actionLabel="Retry history" onAction={() => void runs.refetch()} /> : !runs.data?.runs.length ? <Text style={theme.type.footnote}>No runs yet. Generated documents and failures will appear here.</Text> : runs.data.runs.map(run => <ListRow key={run.id} label={`${run.generatedType} · ${run.status}`} subtitle={`${run.scheduledFor}${run.failureReason ? ` · ${run.failureReason}` : ''}${run.deliveryMessage ? ` · ${run.deliveryMessage}` : ''}${run.nextAttemptAt ? ` · Next attempt ${run.nextAttemptAt}` : ''}`} value={run.generatedId && ['invoice', 'bill'].includes(run.generatedType) ? 'Open document' : `${run.attemptCount} attempts`} onPress={run.generatedId && ['invoice', 'bill'].includes(run.generatedType) ? () => open(run) : undefined} showChevron={!!run.generatedId && ['invoice', 'bill'].includes(run.generatedType)} />)}
  </ScrollView>;
}
