import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, View } from 'react-native';
import { AuthApiError } from '@/features/auth/api/http';
import { pendingMutation, type PendingMutation } from '@/features/accounting/pendingMutation';
import type { AccountDto, CreateJournalEntryRequest } from '@ledgercraft/contracts';
import { openingBalancesRequestSchema, createJournalEntryRequestSchema } from '@ledgercraft/contracts';
import { ModernInput } from '@/components/ui/ModernInput';
import { ModernButton } from '@/components/ui/ModernButton';
import { SelectionRow, SelectionSheet } from '@/components/ui/SelectionSheet';
import { accountingApi } from '@/features/accounting/accountingApi';
import { useTabScreenInsets } from '@/hooks/useTabScreenInsets';
import { formatMoney } from '@/utils/money';
import { useTheme, space } from '@/theme';
import { FxRevaluationPanel } from '@/components/accounting/FxRevaluationPanel';
import { AccountingPeriodPanel } from '@/components/accounting/AccountingPeriodPanel';
import { ChartAccountsPanel } from '@/components/accounting/ChartAccountsPanel';
import { LedgerAuditPanel } from '@/components/accounting/LedgerAuditPanel';

export default function AccountingToolsScreen() {
  const [periodOpen, setPeriodOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [scope, setScope] = useState<{ ownerId: string; organisationId: string }>();
  const [pendingManual, setPendingManual] = useState<PendingMutation<CreateJournalEntryRequest> | null>(null);
  const theme = useTheme(); const { bottomPadding } = useTabScreenInsets();
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<'opening' | 'journal'>('opening');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [debit, setDebit] = useState(''); const [credit, setCredit] = useState('');
  const [amount, setAmount] = useState('0.00'); const [reference, setReference] = useState('');
  const [description, setDescription] = useState(''); const [reviewed, setReviewed] = useState(false);
  const [picker, setPicker] = useState<string>();
  const [openingCredit, setOpeningCredit] = useState('');
  const [extraLines, setExtraLines] = useState<Array<{ accountId: string; debit: string; credit: string }>>([]); const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [pendingJournalId, setPendingJournalId] = useState<string>();
  const load = useCallback(async () => { setLoading(true); setLoadError(''); try { const [rows, actor] = await Promise.all([accountingApi.accounts(), accountingApi.scope()]); setAccounts(rows); setScope(actor); const pending = await pendingMutation.load(actor.ownerId, `manual-journal.${actor.organisationId}`, (input) => createJournalEntryRequestSchema.parse(input)); if (pending) await pendingMutation.fail(actor.ownerId, `manual-journal.${actor.organisationId}`, 0); setPendingManual(pending ? { ...pending, uncertain: true } : null); if (pending) { setMode('journal'); setDate(pending.input.entryDate); setReference(pending.input.referenceNumber ?? ''); setDescription(pending.input.description); setDebit(pending.input.debitAccountId); setCredit(pending.input.creditAccountId); setAmount(pending.input.amount); setReviewed(false); } } catch (caught) { setLoadError(caught instanceof Error ? caught.message : 'Accounts unavailable.'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const change = (setter: (value: string) => void, value: string) => { setter(value); setReviewed(false); setSuccess(''); setError(''); };
  async function post() {
    if (!scope || !reviewed || debit === credit || !debit || !credit) { setError('Choose different debit and credit accounts and confirm your review.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      if (mode === 'opening') {
        const input = openingBalancesRequestSchema.parse({ date, reference, reviewed: true, lines: [{ accountId: debit, debit: amount, credit: '0.00' }, { accountId: credit, debit: '0.00', credit: openingCredit || amount }, ...extraLines] });
        const result = await accountingApi.open(input); setSuccess(`Opening balances ${result.replayed ? 'already posted' : 'posted'}: ${formatMoney(result.total)}`);
      } else {
        let id = pendingJournalId;
        if (!id) {
          const input = pendingManual?.input ?? createJournalEntryRequestSchema.parse({ entryDate: date, description, referenceNumber: reference || null, debitAccountId: debit, creditAccountId: credit, amount });
          const pending = pendingManual ?? await pendingMutation.claim(scope.ownerId, `manual-journal.${scope.organisationId}`, input, (value) => createJournalEntryRequestSchema.parse(value)); setPendingManual(pending);
          const draft = await accountingApi.createJournal(pending.input, pending.key); await pendingMutation.fail(scope.ownerId, `manual-journal.${scope.organisationId}`, 0); id = draft.id; setPendingJournalId(id);
        }
        await accountingApi.postJournal(id); await pendingMutation.clear(scope.ownerId, `manual-journal.${scope.organisationId}`); setPendingManual(null); setPendingJournalId(undefined); setSuccess(`Journal posted: ${formatMoney(amount)}`);
      }
      setReviewed(false);
    } catch (caught) { if (scope && mode === 'journal') { if (caught instanceof AuthApiError && caught.code === 'IDEMPOTENCY_CONFLICT') await pendingMutation.fail(scope.ownerId, `manual-journal.${scope.organisationId}`, 0); await pendingMutation.fail(scope.ownerId, `manual-journal.${scope.organisationId}`, caught instanceof AuthApiError ? caught.status : 0); setPendingManual(await pendingMutation.load(scope.ownerId, `manual-journal.${scope.organisationId}`, (input) => createJournalEntryRequestSchema.parse(input))); } setError(caught instanceof Error ? caught.message : 'Journal could not be posted.'); }
    finally { setBusy(false); }
  }
  const choose = (id: string) => { if (picker === 'debit') setDebit(id); else if (picker === 'credit') setCredit(id); else if (picker?.startsWith('extra:')) { const index = Number(picker.slice(6)); setExtraLines((rows) => rows.map((row, position) => position === index ? { ...row, accountId: id } : row)); } setPicker(undefined); setReviewed(false); };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{ backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: space.screen, paddingBottom: bottomPadding, gap: space.lg }}>
    <Text style={theme.type.title}>Accounting tools</Text>
    <Text style={theme.type.subhead}>Opening balances and manual journals post to your ledger. Account opening metadata alone does not create a journal. Review account classification before posting; ask your accountant when unsure.</Text>
    <ModernButton variant="secondary" onPress={() => setChartOpen(!chartOpen)}>{chartOpen ? 'Hide chart accounts' : 'Manage chart accounts'}</ModernButton>
    {chartOpen ? <ChartAccountsPanel onChanged={() => void load()} /> : null}
    <ModernButton variant="secondary" onPress={() => setPeriodOpen(!periodOpen)}>{periodOpen ? 'Hide period protection' : 'Accounting period protection'}</ModernButton>
    {periodOpen ? <AccountingPeriodPanel /> : null}
    {loading ? <ActivityIndicator /> : loadError ? <><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{loadError}</Text><ModernButton onPress={() => void load()}>Retry accounts</ModernButton></> : !accounts.length ? <Text style={theme.type.body}>No active NZD accounts. Open Manage chart accounts to create and classify accounts here.</Text> : <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{(['opening', 'journal'] as const).map((value) => <ModernButton key={value} disabled={busy || Boolean(pendingJournalId) || Boolean(pendingManual)} variant={mode === value ? 'primary' : 'secondary'} onPress={() => { setMode(value); setReviewed(false); setSuccess(''); }}>{value === 'opening' ? 'Opening balances' : 'Manual journal'}</ModernButton>)}</View>
      <ModernInput label="Journal date" value={date} editable={!busy && !pendingJournalId && !pendingManual} onChangeText={(value) => change(setDate, value)} />
      <ModernInput label="Journal reference" value={reference} editable={!busy && !pendingJournalId && !pendingManual} onChangeText={(value) => change(setReference, value)} />
      {mode === 'journal' ? <ModernInput label="Journal description" value={description} editable={!busy && !pendingJournalId && !pendingManual} onChangeText={(value) => change(setDescription, value)} /> : null}
      <ModernButton variant="secondary" disabled={busy || Boolean(pendingJournalId) || Boolean(pendingManual)} onPress={() => { setPicker('debit'); setSearch(''); }}>{accounts.find((account) => account.id === debit)?.name ?? 'Choose debit account'}</ModernButton>
      <ModernButton variant="secondary" disabled={busy || Boolean(pendingJournalId) || Boolean(pendingManual)} onPress={() => { setPicker('credit'); setSearch(''); }}>{accounts.find((account) => account.id === credit)?.name ?? 'Choose credit account'}</ModernButton>
      <ModernInput label="Journal amount" value={amount} editable={!busy && !pendingJournalId && !pendingManual} onChangeText={(value) => change(setAmount, value)} keyboardType="decimal-pad" />
      {mode === 'opening' ? <>
        <ModernInput label="Opening credit amount" placeholder="Same as journal amount" value={openingCredit} editable={!busy} onChangeText={(value) => change(setOpeningCredit, value)} keyboardType="decimal-pad" />
        {extraLines.map((line, index) => <View key={index} style={{ gap: space.sm }}>
          <ModernButton variant="secondary" disabled={busy} onPress={() => { setPicker(`extra:${index}`); setSearch(''); }}>{accounts.find((account) => account.id === line.accountId)?.name ?? `Choose opening account ${index + 3}`}</ModernButton>
          <ModernInput label={`Opening debit ${index + 3}`} value={line.debit} editable={!busy} onChangeText={(value) => { setExtraLines((rows) => rows.map((row, position) => position === index ? { ...row, debit: value } : row)); setReviewed(false); }} keyboardType="decimal-pad" />
          <ModernInput label={`Opening credit ${index + 3}`} value={line.credit} editable={!busy} onChangeText={(value) => { setExtraLines((rows) => rows.map((row, position) => position === index ? { ...row, credit: value } : row)); setReviewed(false); }} keyboardType="decimal-pad" />
          <ModernButton variant="ghost" disabled={busy} onPress={() => { setExtraLines(extraLines.filter((_, position) => position !== index)); setReviewed(false); }}>Remove opening line {index + 3}</ModernButton>
        </View>)}
        <ModernButton variant="secondary" disabled={busy} onPress={() => { setExtraLines([...extraLines, { accountId: '', debit: '0.00', credit: '0.00' }]); setReviewed(false); }}>Add opening line</ModernButton>
      </> : null}
      <Text style={theme.type.body}>Debit {accounts.find((account) => account.id === debit)?.name ?? '—'} / Credit {accounts.find((account) => account.id === credit)?.name ?? '—'}: {amount} NZD</Text>
      <Text style={theme.type.subhead}>{mode === 'opening' ? 'Opening balances can be posted once per company. Enter all opening balances together; include every opening account once. Total debits and credits must balance.' : 'A manual journal changes the selected accounts only. Enter GST lines through the appropriate document or adjustment workflow.'}</Text>
      <Switch accessibilityLabel="Confirm opening balances reviewed" value={reviewed} disabled={busy} onValueChange={setReviewed} />
      <ModernButton disabled={!reviewed || busy} loading={busy} onPress={() => void post()}>{pendingJournalId ? 'Retry journal posting' : pendingManual ? 'Resume saved manual journal' : mode === 'opening' ? 'Post opening balances' : 'Post manual journal'}</ModernButton>
    </>}
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null}
    {success ? <Text style={theme.type.body}>{success}</Text> : null}
    <LedgerAuditPanel />
    <FxRevaluationPanel />
    <SelectionSheet visible={Boolean(picker)} title={picker === 'debit' ? 'Debit account' : picker === 'credit' ? 'Credit account' : 'Opening account'} searchQuery={search} searchPlaceholder="Search ledger accounts" onSearchChange={setSearch} onClose={() => setPicker(undefined)} loading={false} empty={!accounts.length} emptyTitle="No accounts">
      {accounts.filter((account) => `${account.name} ${account.accountNumber ?? ''}`.toLowerCase().includes(search.toLowerCase())).map((account) => <SelectionRow key={account.id} title={account.name} selected={account.id === (picker === 'debit' ? debit : credit)} subtitle={`${account.accountNumber ?? ''} · ${account.accountClass ?? account.type}`} onPress={() => choose(account.id)} />)}
    </SelectionSheet>
  </ScrollView>;
}
