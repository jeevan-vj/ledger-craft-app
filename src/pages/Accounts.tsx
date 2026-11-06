import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppData } from '@/hooks/useAppData';
import { Account, AccountType } from '@/types';
import { Table } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { accountsApi } from '@/features/payments/api/paymentsApi';
import { reportsApi } from '@/features/reports/api/reportsApi';
import { OpeningBalancesPanel } from '@/components/accounting/OpeningBalancesPanel';
import { LedgerAuditPanel } from '@/components/accounting/LedgerAuditPanel';
import { ledgerQueryKeys } from '@/features/app-data/useLedgerQueries';

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' }, { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit Card' }, { value: 'loan', label: 'Loan' },
  { value: 'custom', label: 'Custom' },
];
type AccountForm = { name: string; type: AccountType; currency: string; openingBalance: string; accountNumber: string; accountClass: string };
const emptyAccount = (currency: string): AccountForm => ({ name: '', type: 'bank', currency, openingBalance: '0', accountNumber: '', accountClass: 'asset' });
const date = new Date().toISOString().slice(0, 10);
const balanceText = (amount: string) => {
  const [whole, fraction = '00'] = amount.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0');
};

export default function AccountsPage() {
  const { accounts, isLoadingAccounts, businessProfile, refreshAccounts } = useAppData();
  const queryClient = useQueryClient();
  const balances = useQuery({
    queryKey: ['reports', 'account-balances', date],
    queryFn: () => reportsApi.financial({ from: date.slice(0, 4) + '-01-01', to: date, basis: 'accrual', baseCurrency: 'NZD' }),
  });
  const posted = new Map(balances.data?.trialBalance.rows.map((row) => [row.accountId, row.balance]) ?? []);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryTab, setRecoveryTab] = useState<'opening' | 'audit'>('opening');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<AccountForm>(() => emptyAccount(businessProfile?.currency ?? 'NZD'));
  const [saving, setSaving] = useState(false);
  function openCreate() { setEditing(null); setForm(emptyAccount(businessProfile?.currency ?? 'NZD')); setDialogOpen(true); }
  function openEdit(account: Account) {
    setEditing(account);
    setForm({ name: account.name, type: account.type, currency: account.currency, openingBalance: String(account.openingBalance), accountNumber: account.accountNumber ?? '', accountClass: account.accountClass ?? 'asset' });
    setDialogOpen(true);
  }
  async function refresh() {
    await refreshAccounts();
    await queryClient.invalidateQueries({ queryKey: ledgerQueryKeys.accounts });
    await balances.refetch();
  }
  async function handleSave(event: React.FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const input = { ...form, currency: form.currency.toUpperCase(), accountNumber: form.accountNumber || null };
      if (editing) await accountsApi.update(editing.id, input);
      else await accountsApi.create(input);
      setDialogOpen(false); await refresh();
      toast({ title: editing ? 'Account updated' : 'Account created' });
    } catch (error) { toast({ title: 'Could not save account', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); }
    finally { setSaving(false); }
  }
  async function toggleActive(account: Account) {
    setSaving(true);
    try { await accountsApi.update(account.id, { isActive: account.isActive === false }); await refresh(); }
    catch (error) { toast({ title: 'Could not update account', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' }); }
    finally { setSaving(false); }
  }
  return <div className="space-y-6">
    <PageHeader title="Accounts" actions={<Button onClick={openCreate}>Add Account</Button>} />
    <p className="text-sm text-muted-foreground">Posted balances come from the general ledger as at {date}. Opening values need a matching opening journal to appear in financial reports.</p>
    {balances.isError ? <div role="alert" className="text-sm text-destructive">Posted balances could not be loaded. <Button variant="outline" onClick={() => void balances.refetch()}>Try again</Button></div> : null}
    {isLoadingAccounts ? <div className="flex justify-center items-center h-32"><Spinner /></div> : <Table>
      <thead><tr><th>Name</th><th>Type</th><th>Currency</th><th>Opening value</th><th>Posted ledger balance (NZD)</th><th>Status</th><th /></tr></thead>
      <tbody>{accounts.map((account) => <tr key={account.id}>
        <td>{account.name}</td><td>{account.accountClass ?? account.type}</td><td>{account.currency}</td><td>{account.openingBalance}</td>
        <td>{balances.isError ? 'Unavailable' : balances.isPending ? 'Loading…' : balanceText(posted.get(account.id) ?? '0.00')}</td>
        <td>{account.isActive === false ? 'Inactive' : 'Active'}</td>
        <td><Button size="sm" variant="outline" onClick={() => openEdit(account)}>Edit</Button><Button size="sm" variant="outline" disabled={saving} className="ml-2" onClick={() => void toggleActive(account)}>{account.isActive === false ? 'Activate' : 'Deactivate'}</Button></td>
      </tr>)}</tbody>
    </Table>}
    <div className="space-y-4"><Button variant="outline" aria-expanded={recoveryOpen} onClick={() => setRecoveryOpen((open) => !open)}>Opening balances and historical corrections</Button>
      {recoveryOpen && <div className="space-y-4"><div className="flex flex-wrap gap-2"><Button variant={recoveryTab === 'opening' ? 'default' : 'outline'} onClick={() => setRecoveryTab('opening')}>Opening balances</Button><Button variant={recoveryTab === 'audit' ? 'default' : 'outline'} onClick={() => setRecoveryTab('audit')}>Historical corrections</Button></div>{recoveryTab === 'opening' ? <OpeningBalancesPanel accounts={accounts} onPosted={() => void refresh()} /> : <LedgerAuditPanel accounts={accounts} onPosted={() => void refresh()} />}</div>}
    </div>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogTitle>{editing ? 'Edit Account' : 'Add Account'}</DialogTitle>
      <form onSubmit={handleSave} className="space-y-4 mt-4">
        <div><label htmlFor="account-name">Name</label><Input id="account-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>
        <div><label htmlFor="account-type">Type</label><Select value={form.type} onValueChange={(type) => setForm({ ...form, type: type as AccountType, accountClass: type === 'loan' || type === 'credit_card' ? 'liability' : type === 'custom' ? form.accountClass : 'asset' })}><SelectTrigger id="account-type"><SelectValue /></SelectTrigger><SelectContent>{ACCOUNT_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>
        <div><label htmlFor="account-class">Classification</label><Select value={form.accountClass} onValueChange={(accountClass) => setForm({ ...form, accountClass })}><SelectTrigger id="account-class"><SelectValue /></SelectTrigger><SelectContent>{['asset', 'liability', 'equity', 'revenue', 'expense'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
        <div><label htmlFor="account-number">Account code</label><Input id="account-number" value={form.accountNumber} onChange={(event) => setForm({ ...form, accountNumber: event.target.value })} /></div>
        <div><label htmlFor="account-currency">Currency</label><Input id="account-currency" value={form.currency} maxLength={3} onChange={(event) => setForm({ ...form, currency: event.target.value })} required /></div>
        <div><label htmlFor="account-opening">Opening value</label><Input id="account-opening" inputMode="decimal" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} required /></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? <Spinner /> : 'Save'}</Button></div>
      </form>
    </DialogContent></Dialog>
  </div>;
}
