import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { BookEntryDto, ReconciliationSessionDto } from '@ledgercraft/contracts';
import { createReconciliationSessionRequestSchema } from '@ledgercraft/contracts';
import type { BankTransactionDto } from '@/features/banking/api/bankingApi';
import { settlementMatchingApi } from '@/features/banking/api/settlementMatchingApi';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { formatMoney } from '@/utils/money';
import { cents } from '@/features/banking/model/reconciliationMath';
import { useTheme, space } from '@/theme';

export function ExistingSettlementPanel({ transaction, onMatched }: { transaction: BankTransactionDto; onMatched: () => void }) {
  const theme = useTheme();
  const [from, setFrom] = useState(`${transaction.transactionDate.slice(0, 7)}-01`); const [to, setTo] = useState(transaction.transactionDate);
  const [opening, setOpening] = useState(''); const [closing, setClosing] = useState('');
  const [entries, setEntries] = useState<BookEntryDto[]>(); const [sessions, setSessions] = useState<ReconciliationSessionDto[]>([]);
  const [sessionId, setSessionId] = useState(''); const [entryId, setEntryId] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  async function load() {
    setBusy(true); setError(''); setEntries(undefined); setEntryId(''); setConfirmed(false);
    try {
      const [allEntries, allSessions] = await Promise.all([settlementMatchingApi.entries(from, to), settlementMatchingApi.sessions(transaction.bankAccountId)]);
      setEntries(allEntries.filter((entry) => (transaction.type === 'credit' ? entry.type === 'payment' : entry.type === 'bill_payment' || entry.type === 'expense') && cents(entry.amount) === cents(transaction.amount)));
      const openSessions = allSessions.filter((session) => session.status === 'in_progress' && session.statementStartDate <= transaction.transactionDate && session.statementEndDate >= transaction.transactionDate);
      setSessions(openSessions); setSessionId(openSessions[0]?.id ?? '');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Recorded settlements unavailable.'); }
    finally { setBusy(false); }
  }
  async function createStatement() {
    const parsed = createReconciliationSessionRequestSchema.safeParse({ bankAccountId: transaction.bankAccountId, statementStartDate: from, statementEndDate: to, statementOpeningBalance: opening, statementClosingBalance: closing });
    if (!parsed.success) { setError('Enter the actual statement dates and opening/closing balances. Do not use a guessed balance.'); return; }
    setBusy(true); setError('');
    try { const session = await settlementMatchingApi.createSession(parsed.data); setSessions([...sessions, session]); setSessionId(session.id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Statement could not be created.'); }
    finally { setBusy(false); }
  }
  async function match() {
    const selected = entries?.find((entry) => entry.id === entryId); if (!confirmed || !selected || !sessionId) return;
    setBusy(true); setError('');
    try { await settlementMatchingApi.match(sessionId, { bankTransactionId: transaction.id, bookItemType: selected.type, bookItemId: selected.id, status: 'confirmed' }); setSuccess('Existing settlement matched without another payment'); onMatched(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Match unavailable. Refresh entries and try again.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: space.md }}>
    <Text style={theme.type.headline}>Match an existing settlement</Text>
    <Text style={theme.type.subhead}>Use this when the payment or approved expense is already in the books. Matching preserves that entry and removes the duplicate import posting.</Text>
    <ModernInput label="Statement period start" value={from} editable={!busy} onChangeText={(value) => { setFrom(value); setEntries(undefined); setConfirmed(false); }} />
    <ModernInput label="Statement period end" value={to} editable={!busy} onChangeText={(value) => { setTo(value); setEntries(undefined); setConfirmed(false); }} />
    <ModernButton variant="secondary" disabled={busy} loading={busy} onPress={() => void load()}>Find recorded payments and expenses</ModernButton>
    {entries ? <>
      {!entries.length ? <Text style={theme.type.body}>No recorded settlement matches the full bank amount for these dates.</Text> : null}
      {entries.map((entry) => <ModernButton key={entry.id} disabled={busy} variant={entryId === entry.id ? 'primary' : 'secondary'} onPress={() => { setEntryId(entry.id); setConfirmed(false); }}>{entry.description} · {formatMoney(entry.amount)}</ModernButton>)}
      {sessions.map((session) => <ModernButton key={session.id} disabled={busy} variant={sessionId === session.id ? 'primary' : 'secondary'} onPress={() => { setSessionId(session.id); setConfirmed(false); }}>Statement {session.statementStartDate} to {session.statementEndDate}</ModernButton>)}
      {!sessions.length ? <>
        <Text style={theme.type.subhead}>No open statement includes this transaction. Enter the actual bank statement balances to start one.</Text>
        <ModernInput label="Statement opening balance" value={opening} editable={!busy} onChangeText={setOpening} />
        <ModernInput label="Statement closing balance" value={closing} editable={!busy} onChangeText={setClosing} />
        <ModernButton variant="secondary" disabled={busy} onPress={() => void createStatement()}>Start reviewed statement</ModernButton>
      </> : null}
      <Text style={theme.type.body}>I have checked the recorded settlement against the bank statement</Text>
      <Switch accessibilityLabel="Confirm existing settlement match" value={confirmed} disabled={busy} onValueChange={setConfirmed} />
      <ModernButton disabled={busy || !confirmed || !entryId || !sessionId} onPress={() => void match()}>Match existing settlement</ModernButton>
    </> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
    {success ? <Text style={theme.type.body}>{success}</Text> : null}
  </View>;
}
