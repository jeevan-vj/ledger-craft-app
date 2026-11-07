import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createReconciliationSessionRequestSchema, createReconciliationAdjustmentRequestSchema } from '@ledgercraft/contracts';
import { settlementMatchingApi } from '@/features/banking/api/settlementMatchingApi';
import { StatementSummaryPanel } from './StatementSummaryPanel';
import { FilterPills, GroupedSection, ListRow, ModernButton, ModernInput } from '@/components/ui';
import { useTheme, space } from '@/theme';

export function StatementWorkspacePanel({ bankAccountId, canWrite }: { bankAccountId: string; canWrite: boolean }) {
  const theme = useTheme(); const client = useQueryClient(); const today = new Date().toISOString().slice(0,10);
  const createKey = useRef(`statement-mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`); const adjustmentKey = useRef(`adjustment-mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [creating, setCreating] = useState(false); const [error, setError] = useState('');
  const [start, setStart] = useState(`${today.slice(0,7)}-01`); const [end, setEnd] = useState(today); const [opening, setOpening] = useState(''); const [closing, setClosing] = useState('');
  const [sessionId, setSessionId] = useState(''); const [kind, setKind] = useState<'deposit_in_transit' | 'outstanding_check' | 'bank_error'>('bank_error'); const [amount, setAmount] = useState(''); const [description, setDescription] = useState('');
  const sessions = useQuery({ queryKey: ['banking', 'statement-sessions', bankAccountId], queryFn: () => settlementMatchingApi.sessions(bankAccountId) });
  const create = useMutation({ networkMode: 'always', mutationFn: () => settlementMatchingApi.createSession(createReconciliationSessionRequestSchema.parse({ bankAccountId, statementStartDate: start, statementEndDate: end, statementOpeningBalance: opening, statementClosingBalance: closing }), createKey.current), onSuccess: async session => { setSessionId(session.id); setCreating(false); createKey.current = `statement-mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`; await client.invalidateQueries({ queryKey: ['banking', 'statement-sessions', bankAccountId] }); } });
  const adjustment = useMutation({ networkMode: 'always', mutationFn: () => settlementMatchingApi.addAdjustment(sessionId, createReconciliationAdjustmentRequestSchema.parse({ adjustmentType: kind, description, amount, affectsBank: true, affectsBook: false }), adjustmentKey.current), onSuccess: async () => { setAmount(''); setDescription(''); adjustmentKey.current = `adjustment-mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`; await client.invalidateQueries({ queryKey: ['banking'] }); } });
  const selected = sessions.data?.find(s => s.id === sessionId);
  return <View style={{ gap: space.md }}>
    <Text style={theme.type.headline}>Statement sessions</Text>
    <Text style={theme.type.footnote}>Sessions are stored on the server and can be resumed after restarting the app. Match transactions above, then review exact statement and posted-ledger balances.</Text>
    <ModernButton variant="secondary" onPress={() => void sessions.refetch()}>Refresh statement sessions</ModernButton>
    {sessions.error && <><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{sessions.error.message}</Text><ModernButton variant="secondary" onPress={() => void sessions.refetch()}>Reload sessions</ModernButton></>}
    {sessions.data?.map(session => <ListRow key={session.id} label={`${session.statementStartDate} to ${session.statementEndDate}`} subtitle={`${session.status} · closing ${session.statementClosingBalance}`} value={session.id === sessionId ? 'Selected' : 'Resume'} onPress={() => { setSessionId(session.id); setError(''); }} showChevron={false} />)}
    {canWrite && <ModernButton variant="secondary" onPress={() => setCreating(v => !v)}>Start bank statement</ModernButton>}
    {creating && <GroupedSection title="New statement"><View style={{ padding: space.md, gap: space.sm }}>
      <ModernInput label="Statement start date" value={start} onChangeText={setStart} /><ModernInput label="Statement end date" value={end} onChangeText={setEnd} />
      <ModernInput label="Statement opening balance" value={opening} onChangeText={setOpening} /><ModernInput label="Statement closing balance" value={closing} onChangeText={setClosing} />
      <Text style={theme.type.footnote}>Use exact signed amounts. Statement balances do not create book transactions.</Text>
      <ModernButton loading={create.isPending} onPress={() => { setError(''); create.mutate(); }}>Create statement session</ModernButton>
    </View></GroupedSection>}
    {canWrite && selected?.status === 'in_progress' && <GroupedSection title="Bank-side timing adjustment"><View style={{ padding: space.md, gap: space.sm }}>
      <FilterPills options={['bank_error', 'deposit_in_transit', 'outstanding_check']} value={kind} labels={{ bank_error: 'Bank error', deposit_in_transit: 'Deposit in transit', outstanding_check: 'Outstanding cheque' }} onChange={v => setKind(v as typeof kind)} />
      <ModernInput label="Adjustment description" value={description} onChangeText={setDescription} /><ModernInput label="Adjustment amount" value={amount} onChangeText={setAmount} />
      <Text style={theme.type.footnote}>Deposits and outstanding cheques use positive amounts. A bank error is signed. Fees, interest and book errors require actual posted transactions; this action never changes books.</Text>
      <ModernButton loading={adjustment.isPending} disabled={!description.trim() || !amount.trim()} onPress={() => adjustment.mutate()}>Add bank-side adjustment</ModernButton>
      {adjustment.isSuccess && <Text accessibilityRole="alert" style={{ color: theme.colors.success }}>Adjustment saved. Reload and review the statement summary before completion.</Text>}
    </View></GroupedSection>}
    {error || create.error || adjustment.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error || create.error?.message || adjustment.error?.message}</Text> : null}
    <StatementSummaryPanel key={`${bankAccountId}-${sessionId}-${adjustment.submittedAt}`} bankAccountId={bankAccountId} canWrite={canWrite} />
  </View>;
}
