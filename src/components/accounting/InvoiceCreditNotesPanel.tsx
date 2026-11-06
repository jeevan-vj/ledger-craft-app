import { useCallback, useEffect, useState } from 'react';
import type { BankAccountDto, CreditNoteDto } from '@ledgercraft/contracts';
import { decimal } from '../../../api/src/modules/invoices/money';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { useAuth } from '@/context/StableAuthContext';
import { organisationsApi } from '@/features/organisations/api';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';
import { creditNotesApi } from '@/features/accounting-completion/creditNotesApi';
import { clearPendingCredit, readPendingCredits, savePendingCreditIssue, savePendingCreditRefund, type PendingCreditIssue, type PendingCreditRefund } from '@/features/accounting-completion/pendingCreditOperation';
import { exactMoney, PreparationCheck, PreparationField, today } from './PreparationFields';
import { foreignCurrency, SettlementRatePicker } from './SettlementRatePicker';
type Action = { kind: 'reverse' | 'refund' | 'reverse_refund'; note: CreditNoteDto; refundId?: string };
export function InvoiceCreditNotesPanel({ invoiceId, currency, onChanged, canIssue = true }: { invoiceId: string; currency: string; onChanged?: () => void; canIssue?: boolean }) {
  const { user } = useAuth(); const actorId = user?.id;
  const [companyId, setCompanyId] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const [pendingIssue, setPendingIssue] = useState<PendingCreditIssue>();
  const [pendingRefunds, setPendingRefunds] = useState<Record<string, PendingCreditRefund>>({});
  const [notes, setNotes] = useState<CreditNoteDto[]>([]);
  const [banks, setBanks] = useState<BankAccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('0.00');
  const [taxRate, setTaxRate] = useState('15');
  const [inclusive, setInclusive] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [action, setAction] = useState<Action>();
  const [actionDate, setActionDate] = useState(today());
  const [actionReason, setActionReason] = useState('');
  const [actionAmount, setActionAmount] = useState('0.00');
  const [actionBank, setActionBank] = useState('');
  const [actionRate, setActionRate] = useState('');
  const [actionReviewed, setActionReviewed] = useState(false);
  const [recoveryOperation, setRecoveryOperation] = useState('');
  const [history, setHistory] = useState<{ totalPaid?: string; totalCredited?: string; balanceDue?: string }>();
  const [discardReviewed, setDiscardReviewed] = useState(false);
  const load = useCallback(async () => {
    if (!actorId) return;
    setLoading(true); setError(''); setStorageReady(false);
    try {
      const [result, companies] = await Promise.all([creditNotesApi.list(invoiceId), organisationsApi.list()]);
      const company = companies.organisations.find((candidate) => candidate.isActive);
      if (!company) throw new Error('Load the current company before issuing credits.');
      setCompanyId(company.id); setNotes(result.creditNotes);
      const pending = readPendingCredits(company.id, actorId, invoiceId);
      setPendingIssue(pending.issue); setPendingRefunds(pending.refunds); setStorageReady(true);
      setRecoveryOperation(pending.issue ? 'issue' : Object.keys(pending.refunds)[0] ? `refund:${Object.keys(pending.refunds)[0]}` : '');
      if (pending.issue) { const input = pending.issue.input; setIssueDate(input.issueDate); setReason(input.reason); setAmount(input.items[0]?.rate ?? '0.00'); setTaxRate(input.taxRate); setInclusive(input.taxInclusive); setReviewed(false); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Credit notes unavailable. Try again.'); }
    finally { setLoading(false); }
  }, [actorId, invoiceId]);
  useEffect(() => { void load(); }, [load]);
  async function reload() { setNotes((await creditNotesApi.list(invoiceId)).creditNotes); onChanged?.(); }
  async function issue() {
    if ((!canIssue && !pendingIssue) || !reviewed || !companyId || !actorId || !storageReady || reason.trim().length < 8) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const input = { invoiceId, issueDate, reason, taxInclusive: inclusive, taxRate, items: [{ description: reason, quantity: '1', rate: exactMoney(amount) }] };
      const pending = pendingIssue ?? savePendingCreditIssue(companyId, actorId, invoiceId, input);
      setPendingIssue(pending); setRecoveryOperation('issue');
      await creditNotesApi.create(pending.input, pending.key); await reload();
      clearPendingCredit(companyId, actorId, invoiceId, 'issue'); setPendingIssue(undefined);
      setMessage('Credit note issued'); setReviewed(false); setAmount('0.00'); setReason('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Credit note could not be issued.'); }
    finally { setBusy(false); }
  }
  async function start(next: Action) {
    const pending = next.kind === 'refund' ? pendingRefunds[next.note.id] : undefined;
    setAction(next); setActionDate(pending?.input.refundDate ?? today()); setActionAmount(pending?.input.amount ?? next.note.refundAvailable); setActionReason(''); setActionBank(pending?.input.bankAccountId ?? ''); setActionRate(pending?.input.exchangeRateId ?? ''); setActionReviewed(false); setError(''); setMessage('');
    if (next.kind === 'refund') { try { setBanks(await purchasesApi.listBankAccounts()); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Refund bank accounts unavailable.'); } }
  }
  async function confirm() {
    if (!action || !actionReviewed || !companyId || !actorId || !storageReady) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (action.kind === 'refund') {
        const input = { amount: exactMoney(actionAmount), refundDate: actionDate, bankAccountId: actionBank, ...(foreignCurrency(currency) ? { exchangeRateId: actionRate } : {}) };
        const pending = pendingRefunds[action.note.id] ?? savePendingCreditRefund(companyId, actorId, invoiceId, action.note.id, input);
        setPendingRefunds((current) => ({ ...current, [action.note.id]: pending })); setRecoveryOperation(`refund:${action.note.id}`);
        await creditNotesApi.refund(action.note.id, pending.input, pending.key); await reload();
        clearPendingCredit(companyId, actorId, invoiceId, `refund:${action.note.id}`); setPendingRefunds((current) => { const next = { ...current }; delete next[action.note.id]; return next; }); setMessage('Customer refund recorded');
      } else if (action.kind === 'reverse_refund') { await creditNotesApi.reverseRefund(action.note.id, action.refundId!, { date: actionDate, reason: actionReason }); await reload(); setMessage('Customer refund reversed'); }
      else { await creditNotesApi.reverse(action.note.id, { date: actionDate, reason: actionReason }); await reload(); setMessage('Credit note reversed'); }
      setAction(undefined);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Credit note action could not be completed.'); }
    finally { setBusy(false); }
  }
  async function checkHistory() {
    setError(''); setDiscardReviewed(false);
    try { const [source, latest] = await Promise.all([creditNotesApi.invoiceHistory(invoiceId), creditNotesApi.list(invoiceId)]); setHistory(source); setNotes(latest.creditNotes); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Current invoice and credit history unavailable.'); }
  }
  function discardPending() {
    if (!history || !discardReviewed || !companyId || !actorId || !recoveryOperation) return;
    clearPendingCredit(companyId, actorId, invoiceId, recoveryOperation as 'issue' | `refund:${string}`);
    const pending = readPendingCredits(companyId, actorId, invoiceId); setPendingIssue(pending.issue); setPendingRefunds(pending.refunds); setHistory(undefined); setDiscardReviewed(false); setReviewed(false); setActionReviewed(false); setError('');
  }
  const positive = (value: string) => /^\d+(?:\.\d{0,2})?$/.test(value) && decimal(value).compare(0) > 0;
  const refundPending = action?.kind === 'refund' && Boolean(pendingRefunds[action.note.id]);
  return <ContentPanel><section aria-label="Invoice credits and refunds" className="space-y-5"><div><h2 className="text-xl font-semibold">Invoice credits and refunds</h2><p className="mt-1 text-sm text-muted-foreground">Credit notes reduce the original sale and GST. They first reduce unpaid receivables; any remainder becomes customer credit. Refunds pay that credit from a bank account and do not create a receipt. Do not repeat these posted credits as manual GST adjustments.</p></div>
    {loading && <p role="status">Loading credit notes…</p>}{error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" disabled={busy || loading} onClick={() => void load()}>Reload credit notes</Button></div>}{message && <p role="status">{message}</p>}
    {!loading && !error && notes.length === 0 && <p className="text-sm text-muted-foreground">No credit notes recorded for this invoice</p>}
    {notes.map((note) => <article key={note.id} className="space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">{note.creditNoteNumber}</h3><p className="text-sm">{note.issueDate} · {note.status} · {note.reason}</p><p className="font-medium tabular-nums">Credit total: {note.currency} {note.total} · GST {note.taxAmount}</p><p className="text-sm tabular-nums">Invoice receivable reduced: {note.currency} {note.receivableAmount}</p><p className="text-sm tabular-nums">Customer credit: {note.currency} {note.customerCreditAmount} · Refunded {note.refundedAmount} · Available {note.refundAvailable}</p><div className="flex flex-wrap gap-2">{note.status === 'issued' && <><Button variant="outline" disabled={busy || note.refunds.some((refund) => refund.status === 'completed')} onClick={() => void start({ kind: 'reverse', note })}>Reverse {note.creditNoteNumber}</Button>{(positive(note.refundAvailable) || pendingRefunds[note.id]) && <Button disabled={busy} onClick={() => void start({ kind: 'refund', note })}>{pendingRefunds[note.id] ? 'Resume pending refund' : 'Refund'} {note.creditNoteNumber}</Button>}</>}{note.refunds.map((refund) => <div key={refund.id} className="w-full space-y-2 text-sm"><p className="tabular-nums">Refund {refund.refundDate}: {refund.currency} {refund.amount} · {refund.status}</p>{refund.status === 'completed' && <Button variant="outline" disabled={busy} onClick={() => void start({ kind: 'reverse_refund', note, refundId: refund.id })}>Reverse refund {refund.id}</Button>}</div>)}</div></article>)}
    {action && <fieldset className="space-y-4 rounded-xl border border-border p-4"><legend className="px-1 font-medium">Review credit note action · {action.note.creditNoteNumber}</legend><PreparationField label="Credit action date" type="date" value={actionDate} disabled={busy || refundPending} onChange={(value) => { setActionDate(value); setActionReviewed(false); }} />{action.kind === 'refund' ? <><PreparationField label="Customer refund amount" value={actionAmount} disabled={busy || refundPending} onChange={(value) => { setActionAmount(value); setActionReviewed(false); }} /><label className="space-y-2 text-sm font-medium">Refund paid from account<select className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={actionBank} disabled={busy || refundPending} onChange={(event) => { setActionBank(event.target.value); setActionReviewed(false); }}><option value="">Choose a bank account</option>{banks.filter((bank) => bank.isActive && bank.currency === 'NZD').map((bank) => <option key={bank.id} value={bank.id}>{bank.accountName}</option>)}</select></label>{foreignCurrency(currency) && <SettlementRatePicker currency={currency} date={actionDate} value={actionRate} disabled={busy || refundPending} onChange={(value) => { setActionRate(value); setActionReviewed(false); }} />}</> : <PreparationField label="Credit action reason" value={actionReason} disabled={busy} onChange={(value) => { setActionReason(value); setActionReviewed(false); }} />}<PreparationCheck checked={actionReviewed} disabled={busy} onChange={setActionReviewed}>I have reviewed this credit note action and supporting records</PreparationCheck><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setAction(undefined)}>Cancel credit action</Button><Button disabled={busy || !actionReviewed || (action.kind === 'refund' ? !positive(actionAmount) || !actionBank || (foreignCurrency(currency) && !actionRate) : actionReason.trim().length < 8)} onClick={() => void confirm()}>{action.kind === 'refund' ? refundPending ? 'Retry customer refund' : 'Confirm customer refund' : action.kind === 'reverse_refund' ? 'Confirm refund reversal' : 'Confirm credit note reversal'}</Button></div></fieldset>}
    {(pendingIssue || Object.keys(pendingRefunds).length > 0) && <div className="space-y-3 rounded-xl border border-border p-4"><p className="text-sm">An unresolved credit or refund request is saved for this company and user. Retry its original body and key to recover the result, including after a reload.</p><Button variant="outline" disabled={busy} onClick={() => void checkHistory()}>Refresh invoice and credit history</Button>{history && <><p className="text-sm tabular-nums">Cash received {currency} {history.totalPaid}; credits {history.totalCredited ?? '0.00'}; invoice balance {history.balanceDue}</p><label className="space-y-2 text-sm">Pending request to review<select aria-label="Pending credit request to review" className="flex h-11 w-full rounded-xl border border-input bg-background px-3" value={recoveryOperation} onChange={(event) => { setRecoveryOperation(event.target.value); setDiscardReviewed(false); }}><option value="">Choose a request</option>{pendingIssue && <option value="issue">Credit note {pendingIssue.input.issueDate}: {pendingIssue.input.items[0]?.rate}</option>}{Object.entries(pendingRefunds).map(([id, pending]) => <option key={id} value={`refund:${id}`}>Refund {pending.input.refundDate}: {pending.input.amount}</option>)}</select></label><PreparationCheck checked={discardReviewed} disabled={busy} onChange={setDiscardReviewed}>I checked the invoice, credit notes and bank history and confirmed the selected pending request did not post</PreparationCheck><Button variant="outline" disabled={busy || !discardReviewed || !recoveryOperation} onClick={discardPending}>Discard selected pending request after review</Button></>}</div>}
    {!canIssue && <p role="status" className="text-sm text-muted-foreground">Issue the original invoice before creating a credit note. Draft and cancelled invoices cannot receive new credits.</p>}
    <fieldset className="space-y-4 border-t border-border pt-4"><legend className="font-semibold">Issue a credit against this invoice</legend><div className="grid gap-4 sm:grid-cols-2"><PreparationField label="Credit note date" type="date" value={issueDate} disabled={busy || Boolean(pendingIssue)} onChange={(value) => { setIssueDate(value); setReviewed(false); }} /><PreparationField label="Credit line amount" value={amount} disabled={busy || Boolean(pendingIssue)} onChange={(value) => { setAmount(value); setReviewed(false); }} /><PreparationField label="Credit GST rate (%)" value={taxRate} disabled={busy || Boolean(pendingIssue)} onChange={(value) => { setTaxRate(value); setReviewed(false); }} /><PreparationField label="Credit note reason" value={reason} disabled={busy || Boolean(pendingIssue)} onChange={(value) => { setReason(value); setReviewed(false); }} /></div><PreparationCheck checked={inclusive} disabled={busy || Boolean(pendingIssue)} onChange={(value) => { setInclusive(value); setReviewed(false); }}>Credit line amount includes GST</PreparationCheck><PreparationCheck checked={reviewed} disabled={busy} onChange={setReviewed}>I have checked this credit against the original invoice and its GST treatment</PreparationCheck><Button disabled={loading || busy || (!canIssue && !pendingIssue) || !storageReady || !reviewed || !positive(amount) || reason.trim().length < 8} onClick={() => void issue()}>{pendingIssue ? 'Retry pending credit note' : 'Issue credit note'}</Button><p className="text-xs text-muted-foreground">Amounts are in {currency}. The source invoice determines the permitted tax treatment and maximum remaining credit. Original documents are preserved when a credit is reversed.</p></fieldset>
  </section></ContentPanel>;
}
