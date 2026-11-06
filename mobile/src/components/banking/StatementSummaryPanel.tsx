import React, { useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { ReconciliationSummaryDto, ReconciliationSessionDto } from '@ledgercraft/contracts';
import { settlementMatchingApi } from '@/features/banking/api/settlementMatchingApi';
import { ModernButton } from '@/components/ui/ModernButton';
import { useTheme, space } from '@/theme';
import { formatMoney } from '@/utils/money';

const fields = ['bankBalance', 'adjustedBankBalance', 'bookBalance', 'adjustedBookBalance', 'finalDifference'] as const;
const statusLabel = (status: ReconciliationSessionDto['status']) => status === 'completed' ? 'Completed' : status === 'locked' ? 'Locked' : 'In progress';
export function StatementSummaryPanel({ bankAccountId }: { bankAccountId: string }) {
  const theme = useTheme(); const activeBank = useRef(bankAccountId); activeBank.current = bankAccountId;
  const [sessions, setSessions] = useState<ReconciliationSessionDto[]>(); const [selectedId, setSelectedId] = useState('');
  const [summary, setSummary] = useState<ReconciliationSummaryDto>(); const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { setSessions(undefined); setSelectedId(''); setSummary(undefined); setReviewed(false); setError(''); }, [bankAccountId]);
  async function load() {
    const bank = bankAccountId; setBusy(true); setError(''); setSummary(undefined); setReviewed(false);
    try { const result = await settlementMatchingApi.sessions(bank); if (activeBank.current === bank) setSessions(result); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Bank statements unavailable.'); }
    finally { setBusy(false); }
  }
  async function select(id: string) {
    const bank = bankAccountId; setSelectedId(id); setBusy(true); setError(''); setSummary(undefined); setReviewed(false);
    try { const result = await settlementMatchingApi.summary(id); if (activeBank.current === bank) setSummary(result); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Ledger summary unavailable.'); }
    finally { setBusy(false); }
  }
  async function complete() {
    if (!summary || !reviewed || !summary.isReconciled || summary.session.status !== 'in_progress' || busy) return;
    setBusy(true); setError('');
    try {
      const current = await settlementMatchingApi.summary(summary.session.id);
      if (fields.some((field) => current[field] !== summary[field]) || current.isReconciled !== summary.isReconciled) { setSummary(current); setReviewed(false); setError('Statement balances changed. Review the refreshed summary before completing.'); return; }
      if (!current.isReconciled) { setSummary(current); setReviewed(false); setError('This statement still has a difference.'); return; }
      const completed = await settlementMatchingApi.complete(current.session.id);
      setSummary({ ...current, session: completed }); setSessions((rows) => rows?.map((session) => session.id === completed.id ? completed : session)); setReviewed(false);
    } catch (caught) { setReviewed(false); setError(caught instanceof Error ? caught.message : 'Statement completion unavailable. Reload the summary and try again.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: space.md }}>
    <Text style={theme.type.headline}>Bank statement review</Text>
    <Text style={theme.type.subhead}>Closing balances are calculated by the server from the posted ledger and statement adjustments. Review the statement and matched transactions before completing it.</Text>
    <ModernButton variant="secondary" loading={busy} disabled={busy} onPress={() => void load()}>Review bank statement</ModernButton>
    {sessions?.length === 0 ? <Text style={theme.type.body}>No bank statements for this account</Text> : null}
    {sessions?.map((session) => <ModernButton key={session.id} variant={selectedId === session.id ? 'primary' : 'secondary'} disabled={busy} onPress={() => void select(session.id)}>Statement {session.statementStartDate} to {session.statementEndDate} · {statusLabel(session.status)}</ModernButton>)}
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
    {error && selectedId ? <ModernButton variant="secondary" disabled={busy} onPress={() => void select(selectedId)}>Retry statement summary</ModernButton> : null}
    {summary ? <>
      <Text style={theme.type.headline}>{summary.bankAccountName} · {summary.bankName}</Text>
      <Text style={theme.type.body}>Statement closing balance: {formatMoney(summary.bankBalance)}</Text>
      <Text style={theme.type.body}>Adjusted statement balance: {formatMoney(summary.adjustedBankBalance)}</Text>
      <Text style={theme.type.body}>Posted book balance: {formatMoney(summary.bookBalance)}</Text>
      <Text style={theme.type.body}>Adjusted book balance: {formatMoney(summary.adjustedBookBalance)}</Text>
      <Text style={theme.type.headline}>Final statement difference: {formatMoney(summary.finalDifference)}</Text>
      <Text style={theme.type.caption}>Deposits in transit: {formatMoney(summary.totalOutstandingDeposits)} · Outstanding checks: {formatMoney(summary.totalOutstandingChecks)} · Other adjustments: {formatMoney(summary.totalOtherAdjustments)}</Text>
      {summary.session.status === 'completed' ? <Text style={theme.type.headline}>Statement completed</Text> : summary.session.status === 'locked' ? <Text style={theme.type.body}>Statement locked</Text> : <>
        {!summary.isReconciled ? <Text style={{ color: theme.colors.warning }}>Resolve the statement difference before completing.</Text> : null}
        <Text style={theme.type.body}>I have reviewed this bank statement, ledger balance and adjustments</Text>
        <Switch accessibilityLabel="Confirm bank statement review" value={reviewed} disabled={busy || !summary.isReconciled} onValueChange={setReviewed} />
        <ModernButton disabled={busy || !reviewed || !summary.isReconciled} onPress={() => void complete()}>Complete reviewed statement</ModernButton>
      </>}
    </> : null}
  </View>;
}
