import { useState } from 'react';
import { decimal, roundMoney } from '../../../api/src/modules/invoices/money';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { accountingCompletionApi } from '@/features/accounting-completion/api';
import { exactMoney, PreparationCheck, PreparationField, today } from './PreparationFields';

export interface RecoveryAccount { id: string; name: string; currency: string; isActive?: boolean }
const emptyLine = () => ({ accountId: '', debit: '0.00', credit: '0.00' });
export function OpeningBalancesPanel({ accounts, onPosted }: { accounts: RecoveryAccount[]; onPosted?: () => void }) {
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState('');
  const active = accounts.filter((account) => account.currency === 'NZD' && account.isActive !== false);
  let debit = '0.00'; let credit = '0.00'; let valid = true;
  try {
    debit = roundMoney(lines.reduce((sum, line) => sum.add(exactMoney(line.debit)), decimal(0)));
    credit = roundMoney(lines.reduce((sum, line) => sum.add(exactMoney(line.credit)), decimal(0)));
    valid = lines.every((line) => line.accountId && !line.debit.startsWith('-') && !line.credit.startsWith('-') && (decimal(line.debit).compare(0) > 0) !== (decimal(line.credit).compare(0) > 0));
  } catch { valid = false; }
  const balanced = valid && debit === credit && decimal(debit).compare(0) > 0;
  function change(index: number, field: keyof ReturnType<typeof emptyLine>, value: string) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, [field]: value } : line)); setReviewed(false); setError('');
  }
  async function post() {
    if (!balanced || !reviewed || !reference.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await accountingCompletionApi.opening({ date, reference, reviewed: true, lines: lines.map((line) => ({ ...line, debit: exactMoney(line.debit), credit: exactMoney(line.credit) })) });
      setPosted(result.journalEntryId); onPosted?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Opening balances could not be posted.'); }
    finally { setBusy(false); }
  }
  return <ContentPanel><section aria-label="Opening balances" className="space-y-5"><div><h2 className="text-xl font-semibold">Opening balances</h2><p className="mt-1 max-w-prose text-sm text-muted-foreground">Enter the closing trial balance from your previous accounts. Debits and credits must balance. For owner capital of NZD 5,000, debit the business cash account and credit owner capital. Metadata opening values do not post a journal.</p></div>
    {active.length === 0 && <p role="status" className="text-sm text-muted-foreground">Create active NZD ledger accounts before entering opening balances.</p>}
    <div className="grid gap-4 sm:grid-cols-2"><PreparationField label="Opening balance date" type="date" value={date} disabled={busy || Boolean(posted)} onChange={(value) => { setDate(value); setReviewed(false); }} /><PreparationField label="Opening reference" value={reference} disabled={busy || Boolean(posted)} onChange={(value) => { setReference(value); setReviewed(false); }} /></div>
    {lines.map((line, index) => <fieldset key={index} className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-3"><legend className="px-1 text-sm font-medium">Opening line {index + 1}</legend><label className="space-y-2 text-sm font-medium">Opening account {index + 1}<select className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={line.accountId} disabled={busy || Boolean(posted)} onChange={(event) => change(index, 'accountId', event.target.value)}><option value="">Choose an account</option>{active.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><PreparationField label={`Opening debit ${index + 1}`} value={line.debit} disabled={busy || Boolean(posted)} onChange={(value) => change(index, 'debit', value)} /><PreparationField label={`Opening credit ${index + 1}`} value={line.credit} disabled={busy || Boolean(posted)} onChange={(value) => change(index, 'credit', value)} /></fieldset>)}
    <Button variant="outline" disabled={busy || Boolean(posted)} onClick={() => { setLines((current) => [...current, emptyLine()]); setReviewed(false); }}>Add opening line</Button>
    <p className="font-medium tabular-nums">Total debits NZD {debit} · Total credits NZD {credit}</p>
    {!balanced && <p className="text-sm text-muted-foreground">Choose an account and one positive debit or credit per line, with equal totals.</p>}
    <PreparationCheck checked={reviewed} disabled={busy || Boolean(posted)} onChange={setReviewed}>I have checked these opening balances against the previous accounts</PreparationCheck>
    <Button disabled={busy || Boolean(posted) || !balanced || !reviewed || !reference.trim()} onClick={() => void post()}>{busy ? 'Posting…' : 'Post opening balances'}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{posted && <p role="status">Opening journal posted: {posted}</p>}
    <p className="text-xs text-muted-foreground">An opening journal is allowed once per company. Identical retries return the existing journal. Corrections use a separate reviewed journal.</p>
  </section></ContentPanel>;
}
