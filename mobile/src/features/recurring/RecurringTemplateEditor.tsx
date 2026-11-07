import React, { useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModernButton, ModernInput, GroupedSection, FilterPills, ListRow } from '@/components/ui';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';
import { recurringService, type RecurringTemplate } from '@/services/recurringService';
import { apiRequest } from '@/features/auth/api/http';
import { emptyRecurringDraft, recurringDraftFromTemplate, recurringPayloadFromDraft, type RecurringDraft } from './model/recurringForm';

export function RecurringTemplateEditor({ value, emailAvailable, onClose }: { value?: RecurringTemplate; emailAvailable: boolean; onClose: () => void }) {
  const theme = useTheme(); const client = useQueryClient();
  const [draft, setDraft] = useState(() => value ? recurringDraftFromTemplate(value) : emptyRecurringDraft());
  const [error, setError] = useState(''); const key = useRef(`recurring-mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [preview, setPreview] = useState<{ runAt: string; localDate: string }[] | undefined>();
  const choices = useQuery({ queryKey: ['recurring', 'document-parties'], queryFn: async () => {
    const [customers, vendors, accounts, banks] = await Promise.all([
      apiRequest<{ customers: { id: string; name: string }[] }>('/api/customers'), apiRequest<{ vendors: { id: string; name: string; isActive: boolean }[] }>('/api/vendors'), apiRequest<{ accounts: { id: string; name: string; isActive: boolean }[] }>('/api/accounts'), apiRequest<{ bankAccounts: { id: string; accountName: string; isActive: boolean }[] }>('/api/bank-accounts'),
    ]); return { customers: customers.customers, vendors: vendors.vendors.filter(v => v.isActive), accounts: accounts.accounts.filter(a => a.isActive), banks: banks.bankAccounts.filter(b => b.isActive) };
  } });
  const set = <K extends keyof RecurringDraft>(field: K, next: RecurringDraft[K]) => { setDraft(current => ({ ...current, [field]: next })); setPreview(undefined); setError(''); };
  const request = () => recurringPayloadFromDraft(draft, emailAvailable);
  const save = useMutation({ networkMode: 'always', mutationFn: () => value ? recurringService.update(value.id, request(), key.current) : recurringService.create(request(), key.current), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['recurring'] }); onClose(); } });
  const nextRuns = useMutation({ mutationFn: () => recurringService.preview({ schedule: request().schedule, count: 5 }), onSuccess: result => setPreview(result.occurrences) });
  const submit = (action: 'save' | 'preview') => { setError(''); try { request(); if (action === 'save') save.mutate(); else nextRuns.mutate(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Review the form.'); } };
  const document = draft.kind === 'invoice' || draft.kind === 'bill'; const party = draft.kind === 'invoice' ? choices.data?.customers : choices.data?.vendors;
  const accountChoices = draft.kind === 'income' ? choices.data?.banks.map(b => ({ id: b.id, name: b.accountName })) : choices.data?.accounts;
  const field = (label: string, name: keyof RecurringDraft, keyboardType?: 'decimal-pad' | 'number-pad') => <ModernInput key={name} label={label} value={String(draft[name] ?? '')} onChangeText={v => set(name, v as never)} keyboardType={keyboardType} />;
  return <View style={{ gap: space.lg }}>
    <Text style={theme.type.title}>{value ? 'Edit schedule' : 'New recurring schedule'}</Text>
    <FilterPills options={['invoice', 'bill', 'expense', 'income']} value={draft.kind} labels={{ invoice: 'Invoice', bill: 'Supplier bill', expense: 'Expense', income: 'Income' }} onChange={kind => set('kind', kind as RecurringDraft['kind'])} />
    {field('Schedule name', 'name')}
    {choices.error ? <><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{choices.error.message}</Text><ModernButton variant="secondary" onPress={() => void choices.refetch()}>Retry customers and accounts</ModernButton></> : null}
    {document && <GroupedSection title={draft.kind === 'invoice' ? 'Customer' : 'Supplier'}>{party?.map(p => <ListRow key={p.id} label={p.name} value={draft.partyId === p.id ? 'Selected' : undefined} showChevron={false} onPress={() => set('partyId', p.id)} />)}{!party?.length && <Text style={[theme.type.footnote, { padding: space.md }]}>Create a {draft.kind === 'invoice' ? 'customer' : 'supplier'} before saving this schedule.</Text>}</GroupedSection>}
    {(draft.kind === 'bill' || draft.kind === 'income') && <GroupedSection title={draft.kind === 'income' ? 'Bank account' : 'Expense account'}>{accountChoices?.map(a => <ListRow key={a.id} label={a.name} value={draft.accountId === a.id ? 'Selected' : undefined} showChevron={false} onPress={() => set('accountId', a.id)} />)}</GroupedSection>}
    {field('Description', 'description')}{document && field('Quantity', 'quantity', 'decimal-pad')}{field(document ? 'Unit price (exact amount)' : 'Amount (exact amount)', 'amount', 'decimal-pad')}
    {document && <>{field('GST rate', 'taxRate', 'decimal-pad')}<ListRow label="Prices include GST" showChevron={false} accessory={<Switch accessibilityLabel="Prices include GST" value={draft.taxInclusive} onValueChange={v => set('taxInclusive', v)} />} />{field('Due date on template (YYYY-MM-DD)', 'dueDate')}</>}
    {document && <>
      {(draft.additionalLines ?? []).map((line, index) => <GroupedSection key={index} title={`Additional line ${index + 2}`}><View style={{ padding: space.md, gap: space.sm }}>
        {(['description', 'quantity', 'unitPrice', 'taxRate'] as const).map(name => <ModernInput key={name} label={`Line ${index + 2} ${name === 'unitPrice' ? 'unit price' : name === 'taxRate' ? 'GST rate' : name}`} value={line[name]} onChangeText={value => set('additionalLines', draft.additionalLines?.map((row, i) => i === index ? { ...row, [name]: value } : row))} />)}
        {draft.kind === 'bill' && <FilterPills options={['', ...(choices.data?.accounts.map(a => a.id) ?? [])]} value={line.accountId} labels={Object.fromEntries([['', 'No allocation'], ...(choices.data?.accounts.map(a => [a.id, a.name]) ?? [])])} onChange={value => set('additionalLines', draft.additionalLines?.map((row, i) => i === index ? { ...row, accountId: value } : row))} />}
        <ModernButton variant="secondary" onPress={() => set('additionalLines', draft.additionalLines?.filter((_, i) => i !== index))}>Remove line {index + 2}</ModernButton>
      </View></GroupedSection>)}
      <ModernButton variant="secondary" onPress={() => set('additionalLines', [...(draft.additionalLines ?? []), { description: '', quantity: '1', unitPrice: '', taxRate: draft.taxRate, accountId: draft.accountId }])}>Add document line</ModernButton>
    </>}
    {draft.kind !== 'income' && field('Currency', 'currency')}
    {document && <Text style={theme.type.footnote}>Generated dates and due-date offsets follow the server document rules. Additional lines can be edited below. Existing discounts and attachments are preserved; reviewed document rules are enforced by the server.</Text>}
    <Text style={theme.type.headline}>Schedule</Text>
    <FilterPills options={['daily', 'weekly', 'monthly', 'annual', 'custom']} value={draft.frequency} labels={{ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', annual: 'Annual', custom: 'Custom' }} onChange={v => set('frequency', v as RecurringDraft['frequency'])} />
    {field('Interval', 'interval', 'number-pad')}
    {draft.frequency === 'custom' && <FilterPills options={['day', 'week', 'month', 'year']} value={draft.customUnit} onChange={v => set('customUnit', v as RecurringDraft['customUnit'])} />}
    {field('Start date (YYYY-MM-DD)', 'startDate')}{field('End date (optional)', 'endDate')}{field('Occurrence limit (optional)', 'occurrenceLimit', 'number-pad')}{field('Timezone', 'timezone')}{field('Local time (HH:mm)', 'localTime')}
    {(draft.frequency === 'monthly' || draft.frequency === 'annual' || (draft.frequency === 'custom' && draft.customUnit === 'month')) && field('Day of month (1–31 or last, optional)', 'dayOfMonth')}
    {!emailAvailable && <Text style={theme.type.footnote}>Email delivery is unavailable. Generated invoices remain unsent drafts; no delivery is claimed.</Text>}
    {draft.kind === 'invoice' && <ListRow label="Automatically send invoices" showChevron={false} accessory={<Switch accessibilityLabel="Automatically send invoices" disabled={!emailAvailable && !draft.autoSend} value={draft.autoSend} onValueChange={v => set('autoSend', v)} />} />}
    {error || save.error || nextRuns.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error || save.error?.message || nextRuns.error?.message}</Text> : null}
    <ModernButton variant="secondary" loading={nextRuns.isPending} disabled={save.isPending} onPress={() => submit('preview')}>Preview next 5 runs</ModernButton>
    {preview && <GroupedSection title="Server next-run preview">{preview.map(item => <ListRow key={item.runAt} label={item.localDate} subtitle={`${item.runAt} · ${draft.timezone}`} showChevron={false} />)}{!preview.length && <Text style={theme.type.footnote}>No future occurrences for these limits.</Text>}</GroupedSection>}
    <ModernButton loading={save.isPending} disabled={nextRuns.isPending} onPress={() => submit('save')}>{value ? 'Save schedule changes' : 'Create schedule'}</ModernButton>
    <ModernButton variant="secondary" disabled={save.isPending} onPress={onClose}>Cancel editing</ModernButton>
  </View>;
}
