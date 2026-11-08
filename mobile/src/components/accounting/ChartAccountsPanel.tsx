import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ModernButton } from '@/components/ui/ModernButton';
import { ModernInput } from '@/components/ui/ModernInput';
import { ReportChoicePicker } from '@/components/reports/ReportChoicePicker';
import { createAccountRequestSchema, type CreateAccountRequest } from '@ledgercraft/contracts';
import { AuthApiError } from '@/features/auth/api/http';
import { pendingMutation, type PendingMutation } from '@/features/accounting/pendingMutation';
import { chartAccountsApi } from '@/features/accounting/chartAccountsApi';
import { useTheme, space } from '@/theme';
type AccountOperation = { ownerId: string; organisationId: string; input: CreateAccountRequest; pending: PendingMutation<CreateAccountRequest> | null };
const classes = [{ id: 'asset', name: 'Asset' }, { id: 'liability', name: 'Liability' }, { id: 'equity', name: 'Equity' }, { id: 'revenue', name: 'Revenue' }, { id: 'expense', name: 'Expense' }];
export function ChartAccountsPanel({ onChanged }: { onChanged: () => void }) {
  const theme = useTheme(); const client = useQueryClient();
  const access = useQuery({ queryKey: ['accounting', 'access'], queryFn: chartAccountsApi.access });
  const organisationId = access.data?.organisation.id; const ownerId = access.data?.user.id;
  const currentScope = useRef(organisationId); currentScope.current = organisationId;
  const accounts = useQuery({ queryKey: ['accounting', 'chart', organisationId], queryFn: chartAccountsApi.list, enabled: Boolean(organisationId) });
  const banks = useQuery({ queryKey: ['banking', 'accounts', organisationId], queryFn: chartAccountsApi.banks, enabled: Boolean(organisationId) });
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [classification, setClassification] = useState('expense');
  const [bankId, setBankId] = useState(''); const [bankMode, setBankMode] = useState(false); const [message, setMessage] = useState('');
  const [pendingAccount, setPendingAccount] = useState<PendingMutation<CreateAccountRequest> | null>(null);
  const [restoring, setRestoring] = useState(true); const [recoveryError, setRecoveryError] = useState('');
  useEffect(() => {
    let active = true; setName(''); setCode(''); setClassification('expense'); setBankId(''); setBankMode(false); setMessage(''); setPendingAccount(null); setRecoveryError(''); setRestoring(true);
    if (!organisationId || !ownerId) return () => { active = false; };
    void pendingMutation.load(ownerId, `chart-account.${organisationId}`, input => createAccountRequestSchema.parse(input)).then(saved => {
      if (!active) return; setPendingAccount(saved);
      if (saved) { setName(saved.input.name); setCode(saved.input.accountNumber ?? ''); setClassification(saved.input.accountClass ?? 'expense'); }
    }).catch(error => { if (active) setRecoveryError(error instanceof Error ? error.message : 'Saved account request unavailable.'); }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [organisationId, ownerId]);
  const canWrite = access.data?.permissions.includes('banking.write') === true;
  async function changed() { await client.invalidateQueries({ queryKey: ['accounting', 'chart', organisationId] }); await client.invalidateQueries({ queryKey: ['accounts'] }); onChanged(); }
  const create = useMutation({ retry: false,
    mutationFn: async (operation: AccountOperation) => {
      const saved = operation.pending ?? await pendingMutation.claim(operation.ownerId, `chart-account.${operation.organisationId}`, operation.input, input => createAccountRequestSchema.parse(input));
      if (currentScope.current === operation.organisationId) setPendingAccount(saved);
      const account = await chartAccountsApi.create(saved.input, operation.organisationId, saved.key); return { account, operation };
    },
    onSuccess: async ({ account, operation }) => {
      await pendingMutation.clear(operation.ownerId, `chart-account.${operation.organisationId}`);
      await client.invalidateQueries({ queryKey: ['accounting', 'chart', operation.organisationId] });
      if (currentScope.current !== operation.organisationId) return;
      setPendingAccount(null); setMessage(`Ledger account created: ${account.name}`); setName(''); setCode(''); await changed();
    },
    onError: async (error, operation) => {
      const status = error instanceof AuthApiError ? error.status : 0;
      try { await pendingMutation.fail(operation.ownerId, `chart-account.${operation.organisationId}`, status); }
      catch { if (currentScope.current === operation.organisationId) setRecoveryError('Saved account request could not be updated. Review the account list before retrying.'); }
      if (currentScope.current === operation.organisationId && status >= 400 && status < 500) setPendingAccount(null);
    },
  });
  const link = useMutation({ mutationFn: () => chartAccountsApi.linkBank(bankId, organisationId!), onSuccess: async account => { setMessage(`Bank ledger ready: ${account.name}`); await changed(); } });
  const busy = create.isPending || link.isPending;
  if (access.isPending || (organisationId && (accounts.isPending || banks.isPending || restoring))) return <ActivityIndicator accessibilityLabel="Loading chart accounts" />;
  const error = accounts.error || access.error || banks.error;
  if (error) return <View style={{ gap: space.md }}><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error instanceof Error ? error.message : 'Chart unavailable.'}</Text><ModernButton onPress={() => { void accounts.refetch(); void access.refetch(); void banks.refetch(); }}>Retry chart accounts</ModernButton></View>;
  return <View style={{ gap: space.md }}>
    <Text style={theme.type.headline}>Chart of accounts</Text>
    <Text style={theme.type.subhead}>Create and classify your ledger accounts here. New accounts start at zero; enter brought-forward amounts through reviewed opening balances.</Text>
    {!accounts.data?.length ? <Text style={theme.type.body}>No ledger accounts yet.</Text> : accounts.data.map(account => <View key={account.id}><Text style={theme.type.callout}>{account.name}</Text><Text style={theme.type.caption}>{account.accountNumber ?? 'No account code'} · {account.accountClass ?? account.type} · {account.currency}{account.isActive ? '' : ' · Inactive'}</Text></View>)}
    {canWrite ? <>
      <ModernButton variant="secondary" disabled={busy || Boolean(pendingAccount) || Boolean(recoveryError)} onPress={() => { setBankMode(!bankMode); setMessage(''); create.reset(); link.reset(); }}>{bankMode ? 'Create another ledger account' : 'Link a bank account'}</ModernButton>
      {bankMode ? <>
        <Text style={theme.type.subhead}>Choose the business bank to use in your opening journal. This creates its ledger link without posting an opening amount.</Text>
        <ReportChoicePicker label="Bank ledger account" value={bankId} choices={(banks.data ?? []).filter(bank => bank.isActive && bank.currency === 'NZD').map(bank => ({ id: bank.id, name: bank.accountName }))} onChange={setBankId} />
        <ModernButton disabled={busy || !bankId} loading={link.isPending} onPress={() => { setMessage(''); link.mutate(); }}>Prepare bank ledger</ModernButton>
        {!banks.data?.some(bank => bank.isActive && bank.currency === 'NZD') ? <Text style={theme.type.body}>Create an active NZD business bank account first.</Text> : null}
      </> : <>
        <ModernInput label="Ledger account name" value={name} editable={!busy && !pendingAccount && !recoveryError} onChangeText={setName} />
        <ModernInput label="Ledger account code" value={code} editable={!busy && !pendingAccount && !recoveryError} onChangeText={setCode} />
        {pendingAccount ? <Text style={theme.type.body}>Classification: {classes.find(item => item.id === classification)?.name ?? classification}</Text> : <ReportChoicePicker label="Account classification" value={classification} choices={classes} onChange={setClassification} />}
        {pendingAccount ? <Text style={theme.type.subhead}>A saved ledger-account request needs confirmation. Retrying uses its original details and key, including after reopening the app.</Text> : null}
        <ModernButton variant="secondary" disabled={busy} onPress={() => void accounts.refetch()}>Refresh chart accounts</ModernButton>
        <ModernButton disabled={busy || !name.trim() || Boolean(recoveryError)} loading={create.isPending} onPress={() => { setMessage(''); create.mutate({ ownerId: ownerId!, organisationId: organisationId!, input: pendingAccount?.input ?? { name: name.trim(), accountNumber: code.trim() || null, accountClass: classification, type: classification === 'equity' ? 'custom' : classification, currency: 'NZD', openingBalance: '0.00', isActive: true }, pending: pendingAccount }); }}>{pendingAccount ? 'Retry saved ledger account' : 'Create ledger account'}</ModernButton>
      </>}
      {recoveryError ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{recoveryError}</Text> : null}
      {create.error || link.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{(create.error || link.error)?.message}</Text> : null}
      {message ? <Text style={theme.type.body}>{message}</Text> : null}
    </> : <Text style={theme.type.subhead}>Account changes require banking write access.</Text>}
  </View>;
}
