import { useCallback, useEffect, useState } from 'react';
import type { AccountDto, BankMatchingRuleDto, CreateBankMatchingRuleRequest } from '@ledgercraft/contracts';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { bankReconciliationApi } from '../api/bankReconciliationApi';

const emptyForm: CreateBankMatchingRuleRequest = {
  descriptionContains: '', amountMin: null, amountMax: null, direction: 'any', targetAccountId: '', contactId: null, enabled: true,
};

export function MatchingRules() {
  const [rules, setRules] = useState<BankMatchingRuleDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [form, setForm] = useState<CreateBankMatchingRuleRequest>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextRules, nextAccounts] = await Promise.all([bankReconciliationApi.rules(), bankReconciliationApi.accounts()]);
      setRules(nextRules);
      setAccounts(nextAccounts);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load matching rules'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const reset = () => { setForm(emptyForm); setEditingId(null); };
  const edit = (rule: BankMatchingRuleDto) => {
    setEditingId(rule.id);
    setForm({
      descriptionContains: rule.descriptionContains,
      amountMin: rule.amountMin,
      amountMax: rule.amountMax,
      direction: rule.direction,
      targetAccountId: rule.targetAccountId,
      contactId: rule.contactId,
      enabled: rule.enabled,
    });
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      if (editingId) await bankReconciliationApi.updateRule(editingId, form);
      else await bankReconciliationApi.createRule(form);
      toast.success(editingId ? 'Matching rule updated' : 'Matching rule created');
      reset(); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save matching rule'); }
    finally { setSaving(false); }
  };
  const remove = async (rule: BankMatchingRuleDto) => {
    if (!window.confirm(`Delete the rule for “${rule.descriptionContains}”?`)) return;
    try { await bankReconciliationApi.removeRule(rule.id); toast.success('Matching rule deleted'); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete matching rule'); }
  };

  return <div className="grid gap-6 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(28rem,1.2fr)]">
    <Card><CardHeader><CardTitle>{editingId ? 'Edit matching rule' : 'Create matching rule'}</CardTitle><CardDescription>Rules surface ranked suggestions. A person must accept every match.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2"><Label htmlFor="rule-description">Description contains</Label><Input id="rule-description" required value={form.descriptionContains} onChange={(event) => setForm((value) => ({ ...value, descriptionContains: event.target.value }))} placeholder="e.g. Monthly bank charge" /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="rule-min">Minimum amount</Label><Input id="rule-min" inputMode="decimal" value={form.amountMin ?? ''} onChange={(event) => setForm((value) => ({ ...value, amountMin: event.target.value || null }))} placeholder="Any" /></div><div className="space-y-2"><Label htmlFor="rule-max">Maximum amount</Label><Input id="rule-max" inputMode="decimal" value={form.amountMax ?? ''} onChange={(event) => setForm((value) => ({ ...value, amountMax: event.target.value || null }))} placeholder="Any" /></div></div>
      <div className="space-y-2"><Label htmlFor="rule-direction">Money direction</Label><Select value={form.direction} onValueChange={(direction: CreateBankMatchingRuleRequest['direction']) => setForm((value) => ({ ...value, direction }))}><SelectTrigger id="rule-direction"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Money in or out</SelectItem><SelectItem value="credit">Money in</SelectItem><SelectItem value="debit">Money out</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="rule-account">Suggest account</Label><Select value={form.targetAccountId} onValueChange={(targetAccountId) => setForm((value) => ({ ...value, targetAccountId }))}><SelectTrigger id="rule-account"><SelectValue placeholder="Choose ledger account" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3"><div><Label htmlFor="rule-enabled">Rule enabled</Label><p className="text-xs text-muted-foreground">Disabled rules stop suggesting matches.</p></div><Switch id="rule-enabled" checked={form.enabled} onCheckedChange={(enabled) => setForm((value) => ({ ...value, enabled }))} /></div>
      <div className="flex gap-2"><Button type="submit" disabled={saving || !form.descriptionContains.trim() || !form.targetAccountId}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}{editingId ? 'Save changes' : 'Create rule'}</Button>{editingId && <Button type="button" variant="outline" onClick={reset}>Cancel</Button>}</div>
    </form></CardContent></Card>

    <Card><CardHeader><CardTitle>Matching rules</CardTitle><CardDescription>{rules.length} {rules.length === 1 ? 'rule' : 'rules'} · suggestions only, never auto-posted</CardDescription></CardHeader><CardContent className="space-y-2">{loading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : rules.length === 0 ? <div className="py-12 text-center"><p className="font-medium">No matching rules yet</p><p className="mt-1 text-sm text-muted-foreground">Create a rule for recurring descriptions such as fees or subscriptions.</p></div> : rules.map((rule) => <div key={rule.id} className="flex items-center justify-between gap-4 rounded-2xl bg-muted/40 p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">Contains “{rule.descriptionContains}”</p><Badge variant={rule.enabled ? 'secondary' : 'outline'}>{rule.enabled ? 'Enabled' : 'Disabled'}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{rule.direction === 'any' ? 'Money in or out' : rule.direction === 'credit' ? 'Money in' : 'Money out'} · {accounts.find((account) => account.id === rule.targetAccountId)?.name ?? 'Ledger account'}{rule.amountMin || rule.amountMax ? ` · ${rule.amountMin ?? '0'} to ${rule.amountMax ?? 'any'}` : ''}</p></div><div className="flex shrink-0 items-center gap-1"><Switch aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.descriptionContains}`} checked={rule.enabled} onCheckedChange={(enabled) => void bankReconciliationApi.updateRule(rule.id, { enabled }).then(load).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not update rule'))} /><Button size="icon" variant="ghost" aria-label={`Edit ${rule.descriptionContains}`} onClick={() => edit(rule)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Delete ${rule.descriptionContains}`} onClick={() => void remove(rule)}><Trash2 className="h-4 w-4" /></Button></div></div>)}</CardContent></Card>
  </div>;
}
