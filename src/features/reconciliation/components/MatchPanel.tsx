import { useEffect, useMemo, useState } from 'react';
import type {
  AccountDto,
  BankTransactionDto,
  BankTransactionSuggestion,
  BillDto,
  InvoiceDto,
} from '@ledgercraft/contracts';
import { ArrowRightLeft, Check, Loader2, Plus, RotateCcw, Search, ShieldCheck, Sparkles, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { bankApi } from '@/features/bank/api/bankApi';
import { bankReconciliationApi, cents, moneyFromCents } from '../api/bankReconciliationApi';
import { calculateAmountLeft } from './reconciliationMath';

type DocumentType = 'invoice' | 'bill';
type Allocation = { documentType: DocumentType; documentId: string; label: string; amount: string; balanceDue: string };
type Split = { accountId: string; amount: string };

function money(value: string, currency = 'NZD') {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(Number(value));
}

function documentLabel(document: InvoiceDto | BillDto, type: DocumentType) {
  return type === 'invoice'
    ? `${(document as InvoiceDto).invoiceNumber} · ${(document as InvoiceDto).customerName ?? 'Customer'}`
    : `${(document as BillDto).billNumber} · ${(document as BillDto).vendorName}`;
}

interface MatchPanelProps {
  transaction: BankTransactionDto | null;
  bankAccounts: Array<{ id: string; accountName: string; isActive: boolean }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void> | void;
}

export function MatchPanel({ transaction, bankAccounts, open, onOpenChange, onChanged }: MatchPanelProps) {
  const [suggestions, setSuggestions] = useState<BankTransactionSuggestion[]>([]);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string>('');
  const [documents, setDocuments] = useState<Array<{ type: DocumentType; data: InvoiceDto | BillDto }>>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [splits, setSplits] = useState<Split[]>([]);
  const [bankFee, setBankFee] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transferAccountId, setTransferAccountId] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [undoReason, setUndoReason] = useState('Reconciliation corrected');

  const reset = () => {
    setAllocations([]);
    setSplits([]);
    setBankFee('');
    setSearch('');
    setShowTransfer(false);
    setShowUndo(false);
  };

  useEffect(() => {
    if (!open || !transaction) return;
    reset();
    setLoading(true);
    Promise.all([
      transaction.isReconciled
        ? Promise.resolve({ transactionId: transaction.id, suggestions: [] })
        : bankReconciliationApi.suggestions(transaction.id),
      transaction.type === 'credit' ? bankReconciliationApi.openInvoices() : bankReconciliationApi.openBills(),
      bankReconciliationApi.accounts(),
    ]).then(([suggestionResponse, openDocuments, ledgerAccounts]) => {
      setSuggestions(suggestionResponse.suggestions);
      setSelectedSuggestionId(suggestionResponse.suggestions[0]?.id ?? '');
      setDocuments(openDocuments.map((data): { type: DocumentType; data: InvoiceDto | BillDto } => ({
        type: transaction.type === 'credit' ? 'invoice' : 'bill',
        data,
      })));
      setAccounts(ledgerAccounts);
    }).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not load matching options'))
      .finally(() => setLoading(false));
  }, [open, transaction]);

  const amountState = useMemo(
    () => calculateAmountLeft(transaction?.amount ?? '0', allocations, splits, bankFee),
    [transaction?.amount, allocations, splits, bankFee],
  );
  const selectedSuggestion = suggestions.find((suggestion) => suggestion.id === selectedSuggestionId) ?? suggestions[0];
  const feeEligible = transaction?.type === 'debit'
    && cents(amountState.amountLeft) > 0n
    && cents(amountState.amountLeft) <= cents(transaction.amount) / 10n;
  const filteredDocuments = documents.filter(({ type, data }) => {
    const haystack = `${documentLabel(data, type)} ${type === 'invoice' ? (data as InvoiceDto).customerEmail ?? '' : (data as BillDto).vendorReference ?? ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && !allocations.some((allocation) => allocation.documentId === data.id);
  });

  if (!transaction) return null;
  const currency = 'NZD';

  const addDocument = (type: DocumentType, data: InvoiceDto | BillDto) => {
    const balanceDue = data.balanceDue;
    const available = cents(amountState.amountLeft) > 0n ? cents(amountState.amountLeft) : 0n;
    const amount = moneyFromCents(cents(balanceDue) < available ? cents(balanceDue) : available);
    setAllocations((rows) => [...rows, { documentType: type, documentId: data.id, label: documentLabel(data, type), amount, balanceDue }]);
  };

  const applySuggestion = (suggestion: BankTransactionSuggestion) => {
    setSelectedSuggestionId(suggestion.id);
    if (suggestion.type === 'matching_rule' && suggestion.targetAccountId) {
      setAllocations([]);
      setBankFee('');
      setSplits([{ accountId: suggestion.targetAccountId, amount: transaction.amount }]);
      return;
    }
    if (suggestion.type === 'invoice' || suggestion.type === 'bill') {
      const match = documents.find(({ data }) => data.id === suggestion.id);
      if (match) {
        setSplits([]);
        setBankFee('');
        setAllocations([{
          documentType: suggestion.type,
          documentId: suggestion.id,
          label: suggestion.description,
          amount: moneyFromCents(cents(suggestion.amount ?? transaction.amount) < cents(transaction.amount) ? cents(suggestion.amount ?? transaction.amount) : cents(transaction.amount)),
          balanceDue: match.data.balanceDue,
        }]);
      }
    }
  };

  const accept = async () => {
    if (!amountState.complete || amountState.overflow) return;
    setSaving(true);
    try {
      await bankReconciliationApi.accept(transaction.id, {
        allocations: allocations.map(({ documentType, documentId, amount }) => ({ documentType, documentId, amount })),
        splits: splits.filter((split) => split.accountId && cents(split.amount) > 0n),
        bankFee: bankFee && cents(bankFee) > 0n ? bankFee : undefined,
        paymentDate: transaction.transactionDate,
        reference: transaction.reference,
      });
      toast.success('Transaction reconciled');
      await onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reconcile transaction');
    } finally {
      setSaving(false);
    }
  };

  const acceptSuggestion = async () => {
    if (!selectedSuggestion) return;
    applySuggestion(selectedSuggestion);
    const suggestionAmount = selectedSuggestion.type === 'matching_rule' ? transaction.amount : selectedSuggestion.amount;
    if (suggestionAmount == null || cents(suggestionAmount) !== cents(transaction.amount)) return;
    setSaving(true);
    try {
      await bankReconciliationApi.accept(transaction.id, {
        allocations: selectedSuggestion.type === 'invoice' || selectedSuggestion.type === 'bill'
          ? [{ documentType: selectedSuggestion.type, documentId: selectedSuggestion.id, amount: transaction.amount }]
          : [],
        splits: selectedSuggestion.type === 'matching_rule' && selectedSuggestion.targetAccountId
          ? [{ accountId: selectedSuggestion.targetAccountId, amount: transaction.amount }]
          : [],
        paymentDate: transaction.transactionDate,
        reference: transaction.reference,
      });
      toast.success('Suggested match accepted');
      await onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not accept suggestion');
    } finally {
      setSaving(false);
    }
  };

  const markPersonal = async () => {
    setSaving(true);
    try {
      await bankReconciliationApi.personal(transaction.id, { notes: 'Marked personal in bank reconciliation' });
      toast.success('Transaction marked as personal');
      await onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not mark transaction personal');
    } finally { setSaving(false); }
  };

  const createTransfer = async () => {
    if (!transferAccountId) return;
    setSaving(true);
    try {
      const sourceAccountId = transaction.type === 'debit' ? transaction.bankAccountId : transferAccountId;
      const destinationAccountId = transaction.type === 'credit' ? transaction.bankAccountId : transferAccountId;
      await bankApi.createTransfer({
        sourceAccountId,
        destinationAccountId,
        transactionDate: transaction.transactionDate,
        amount: transaction.amount,
        description: transaction.description,
        reference: transaction.reference,
      }, crypto.randomUUID());
      toast.success('Transfer recorded');
      await onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record transfer');
    } finally { setSaving(false); }
  };

  const undo = async () => {
    setSaving(true);
    try {
      await bankReconciliationApi.undo(transaction.id, { reason: undoReason, reversalDate: new Date().toISOString().slice(0, 10) });
      toast.success('Reconciliation undone');
      await onChanged();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'This reconciliation cannot be undone here');
    } finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl" aria-describedby="match-panel-description">
        <SheetHeader className="border-b border-border px-6 py-5 pr-14">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="truncate text-xl">{transaction.description}</SheetTitle>
              <SheetDescription id="match-panel-description" className="mt-1">
                {new Date(`${transaction.transactionDate}T00:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                {transaction.reference ? ` · ${transaction.reference}` : ''}
              </SheetDescription>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted-foreground">{transaction.type === 'credit' ? 'Money in' : 'Money out'}</p>
              <p className="font-semibold tabular-nums">{money(transaction.amount, currency)}</p>
            </div>
          </div>
        </SheetHeader>

        {loading ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">Loading matching options</span></div> : transaction.isReconciled ? (
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            <div className="rounded-2xl bg-success/10 p-5">
              <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-success" /><div><p className="font-semibold">Reconciled</p><p className="text-sm text-muted-foreground">Undo is available only for matches and personal transactions made by this workflow.</p></div></div>
            </div>
            {!showUndo ? <Button variant="outline" className="gap-2" onClick={() => setShowUndo(true)}><RotateCcw className="h-4 w-4" />Undo reconciliation</Button> : (
              <div className="space-y-3 rounded-2xl bg-muted/50 p-4"><Label htmlFor="undo-reason">Reason</Label><Input id="undo-reason" value={undoReason} onChange={(event) => setUndoReason(event.target.value)} /><Button variant="destructive" disabled={saving || undoReason.trim().length < 3} onClick={undo}>{saving ? 'Undoing…' : 'Confirm undo'}</Button></div>
            )}
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1">
              <div className="space-y-7 p-6">
                {suggestions.length > 0 && <section aria-labelledby="ranked-suggestions-heading" className="space-y-3">
                  <div className="flex items-center justify-between"><div><h3 id="ranked-suggestions-heading" className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-brand" />Suggested matches</h3><p className="mt-1 text-sm text-muted-foreground">Ranked by the server. Rules suggest only; they never post automatically.</p></div>{selectedSuggestion && (selectedSuggestion.type === 'matching_rule' || cents(selectedSuggestion.amount ?? '0') === cents(transaction.amount)) && <Button size="sm" className="gap-2" onClick={acceptSuggestion} disabled={saving}><Check className="h-4 w-4" />Accept suggestion</Button>}</div>
                  <div className="space-y-2">
                    {suggestions.slice(0, 5).map((suggestion, index) => <button key={`${suggestion.type}:${suggestion.id}`} type="button" onClick={() => applySuggestion(suggestion)} className={`w-full rounded-2xl p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedSuggestionId === suggestion.id ? 'bg-accent ring-1 ring-brand/40' : 'bg-muted/50 hover:bg-muted'}`}>
                      <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate font-medium">{suggestion.description}</span>{index === 0 && <Badge variant="secondary">Top match</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{suggestion.reasons.join(' · ')}</p></div><div className="shrink-0 text-right"><p className="font-semibold tabular-nums">{suggestion.score}%</p>{suggestion.amount && <p className="text-xs text-muted-foreground tabular-nums">{money(suggestion.amount, currency)}</p>}</div></div>
                    </button>)}
                  </div>
                </section>}

                <section aria-labelledby="documents-heading" className="space-y-3">
                  <div><h3 id="documents-heading" className="font-semibold">Match open {transaction.type === 'credit' ? 'invoices' : 'bills'}</h3><p className="mt-1 text-sm text-muted-foreground">Select several documents and adjust each allocation if needed.</p></div>
                  <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label={`Search open ${transaction.type === 'credit' ? 'invoices' : 'bills'}`} className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search number or ${transaction.type === 'credit' ? 'customer' : 'vendor'}`} /></div>
                  {allocations.length > 0 && <div className="space-y-2">{allocations.map((allocation, index) => <div key={allocation.documentId} className="grid grid-cols-[1fr_8rem_2.5rem] items-end gap-2 rounded-2xl bg-muted/50 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{allocation.label}</p><p className="text-xs text-muted-foreground">{money(allocation.balanceDue, currency)} open</p></div><div><Label className="sr-only" htmlFor={`allocation-${allocation.documentId}`}>Allocation for {allocation.label}</Label><Input id={`allocation-${allocation.documentId}`} inputMode="decimal" value={allocation.amount} onChange={(event) => setAllocations((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value } : row))} /></div><Button size="icon" variant="ghost" aria-label={`Remove ${allocation.label}`} onClick={() => setAllocations((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>}
                  <div className="max-h-44 space-y-1 overflow-y-auto">{filteredDocuments.slice(0, 8).map(({ type, data }) => <button key={data.id} type="button" className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => addDocument(type, data)}><span className="min-w-0"><span className="block truncate text-sm font-medium">{documentLabel(data, type)}</span><span className="text-xs text-muted-foreground">Due {new Date(`${data.dueDate}T00:00:00`).toLocaleDateString('en-NZ')}</span></span><span className="flex shrink-0 items-center gap-2 text-sm font-medium tabular-nums">{money(data.balanceDue, currency)}<Plus className="h-4 w-4 text-primary" /></span></button>)}</div>
                </section>

                <section aria-labelledby="remainder-heading" className="space-y-3">
                  <div><h3 id="remainder-heading" className="font-semibold">Remainder</h3><p className="mt-1 text-sm text-muted-foreground">Allocate any amount left to a ledger account or a small bank fee.</p></div>
                  {splits.map((split, index) => <div key={index} className="grid grid-cols-[1fr_8rem_2.5rem] gap-2"><Select value={split.accountId} onValueChange={(value) => setSplits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, accountId: value } : row))}><SelectTrigger aria-label="Remainder account"><SelectValue placeholder="Choose account" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select><Input aria-label="Remainder amount" inputMode="decimal" value={split.amount} onChange={(event) => setSplits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value } : row))} /><Button size="icon" variant="ghost" aria-label="Remove split" onClick={() => setSplits((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}
                  <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setSplits((rows) => [...rows, { accountId: '', amount: cents(amountState.amountLeft) > 0n ? amountState.amountLeft : '' }])}><Plus className="mr-2 h-4 w-4" />Split remainder</Button>{feeEligible && <Button type="button" variant="outline" size="sm" onClick={() => setBankFee(amountState.amountLeft)}>Use {money(amountState.amountLeft, currency)} as bank fee</Button>}</div>
                  {bankFee && <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm"><span>Bank fee adjustment</span><span className="flex items-center gap-3 font-medium tabular-nums">{money(bankFee, currency)}<button type="button" aria-label="Remove bank fee" onClick={() => setBankFee('')}><Trash2 className="h-4 w-4" /></button></span></div>}
                </section>

                <section className="space-y-3 border-t border-border pt-6"><h3 className="font-semibold">Other actions</h3><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" className="gap-2" onClick={markPersonal} disabled={saving}><UserRound className="h-4 w-4" />Mark personal</Button><Button variant="outline" size="sm" className="gap-2" onClick={() => setShowTransfer((value) => !value)}><ArrowRightLeft className="h-4 w-4" />Transfer</Button></div>{showTransfer && <div className="grid gap-3 rounded-2xl bg-muted/50 p-4 sm:grid-cols-[1fr_auto]"><Select value={transferAccountId} onValueChange={setTransferAccountId}><SelectTrigger aria-label="Other bank account"><SelectValue placeholder="Choose the other bank account" /></SelectTrigger><SelectContent>{bankAccounts.filter((account) => account.isActive && account.id !== transaction.bankAccountId).map((account) => <SelectItem key={account.id} value={account.id}>{account.accountName}</SelectItem>)}</SelectContent></Select><Button onClick={createTransfer} disabled={!transferAccountId || saving}>Record transfer</Button></div>}</section>
              </div>
            </ScrollArea>

            <div className="border-t border-border bg-card px-6 py-4">
              <div className={`mb-3 flex items-center justify-between rounded-2xl px-4 py-3 ${amountState.overflow ? 'bg-destructive/10 text-destructive' : amountState.complete ? 'bg-success/10' : 'bg-muted'}`}><div><p className="text-xs font-medium uppercase tracking-wide">Amount left</p><p className="text-xs opacity-75">{money(amountState.allocated, currency)} allocated</p></div><p className="text-xl font-semibold tabular-nums">{money(amountState.amountLeft, currency)}</p></div>
              {amountState.overflow && <p className="mb-3 text-sm text-destructive">Allocations exceed the bank amount. Reduce an allocation before saving.</p>}
              <Button className="w-full" size="lg" onClick={accept} disabled={!amountState.complete || amountState.overflow || saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving match…</> : 'Save reconciliation'}</Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
