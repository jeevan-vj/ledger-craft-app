import React, { useState } from 'react';
import { useAppData } from '@/hooks/useAppData';
import { Account, AccountType } from '@/types';
import { Table } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/layout/PageHeader';

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'loan', label: 'Loan' },
  { value: 'custom', label: 'Custom' },
];

const emptyAccount: Omit<Account, 'id'> = {
  name: '',
  type: 'bank',
  currency: 'USD',
  openingBalance: 0,
  currentBalance: 0,
};

export default function AccountsPage() {
  const {
    accounts,
    isLoadingAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    refreshAccounts,
  } = useAppData();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<Omit<Account, 'id'>>({ ...emptyAccount });
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyAccount });
    setDialogOpen(true);
  }

  function openEdit(account: Account) {
    setEditing(account);
    setForm({
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalance: account.openingBalance,
      currentBalance: account.currentBalance,
    });
    setDialogOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateAccount(editing.id, form);
        toast({ title: 'Account updated' });
      } else {
        await createAccount(form);
        toast({ title: 'Account created' });
      }
      setDialogOpen(false);
      await refreshAccounts();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to save account', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this account?')) return;
    setSaving(true);
    try {
      await deleteAccount(id);
      toast({ title: 'Account deleted' });
      await refreshAccounts();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to delete account', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        actions={<Button onClick={openCreate}>Add Account</Button>}
      />
      {isLoadingAccounts ? (
        <div className="flex justify-center items-center h-32"><Spinner /></div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Currency</th>
              <th>Opening Balance</th>
              <th>Current Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => (
              <tr key={acc.id}>
                <td>{acc.name}</td>
                <td>{ACCOUNT_TYPES.find(t => t.value === acc.type)?.label || acc.type}</td>
                <td>{acc.currency}</td>
                <td>{acc.openingBalance}</td>
                <td>{acc.currentBalance}</td>
                <td>
                  <Button size="sm" variant="outline" onClick={() => openEdit(acc)}>Edit</Button>
                  <Button size="sm" variant="destructive" className="ml-2" onClick={() => handleDelete(acc.id)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogTitle>{editing ? 'Edit Account' : 'Add Account'}</DialogTitle>
          <form onSubmit={handleSave} className="space-y-4 mt-4">
            <div>
              <label className="block mb-1">Name</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="block mb-1">Type</label>
              <Select value={form.type} onValueChange={type => setForm(f => ({ ...f, type: type as AccountType }))}>
                {ACCOUNT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block mb-1">Currency</label>
              <Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} required />
            </div>
            <div>
              <label className="block mb-1">Opening Balance</label>
              <Input type="number" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: Number(e.target.value) }))} required />
            </div>
            <div>
              <label className="block mb-1">Current Balance</label>
              <Input type="number" value={form.currentBalance} onChange={e => setForm(f => ({ ...f, currentBalance: Number(e.target.value) }))} required />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? <Spinner /> : 'Save'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
} 