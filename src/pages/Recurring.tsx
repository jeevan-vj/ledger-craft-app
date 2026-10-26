import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RecurringKind, RecurringPayload, RecurringRunDto, RecurringTemplateDto } from '@ledgercraft/contracts';
import { CalendarClock, ExternalLink, Pause, Play, Plus, Square, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import ItemSelector from '@/components/invoice/ItemSelector';
import { useCustomersQuery } from '@/features/customers/hooks/useCustomers';
import { useItemsQuery } from '@/features/app-data/useLedgerQueries';
import { bankApi } from '@/features/bank/api/bankApi';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';
import { recurringApi } from '@/features/recurring/api';
import { defaultRepeatSettings, RepeatSchedulePanel, type RepeatSettings } from '@/features/recurring/components/RepeatSchedulePanel';
import type { Item } from '@/types';

type InvoiceLineDraft = { id: string; description: string; quantity: string; rate: string; taxRate: string; unit: string };
const newLine = (suffix: string): InvoiceLineDraft => ({ id: suffix, description: '', quantity: '1', rate: '0', taxRate: '0', unit: 'ea' });

function deliveryLabel(run: RecurringRunDto) {
  if (run.deliveryStatus === 'sent') return { text: 'Emailed', needsSending: false, failed: false };
  if (run.deliveryStatus === 'email_not_configured') return { text: run.deliveryMessage || 'Not emailed: email not configured', needsSending: true, failed: false };
  if (run.deliveryStatus === 'failed') return { text: `Email failed${run.deliveryMessage ? `: ${run.deliveryMessage}` : ''}`, needsSending: true, failed: true };
  if (run.deliveryStatus === 'unavailable') return { text: 'Not emailed', needsSending: false, failed: false };
  return { text: 'Email not requested', needsSending: false, failed: false };
}

function RunHistory({ runs }: { runs: RecurringRunDto[] }) {
  if (!runs.length) return <p className="mt-4 text-sm text-muted-foreground">No runs yet.</p>;
  return <div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-semibold">Run history</h3><div className="mt-2 divide-y divide-border">
    {runs.map((run) => {
      const delivery = deliveryLabel(run);
      return <div key={run.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="tabular-nums text-muted-foreground">{new Date(run.scheduledFor).toLocaleString()}</p><div className="mt-1 flex flex-wrap items-center gap-2"><span className={delivery.failed ? 'text-destructive' : 'text-foreground'}>{delivery.text}</span>{delivery.needsSending && <Badge variant="outline" className="border-warning/40 text-warning">Needs sending</Badge>}</div></div>{run.generatedType === 'invoice' && run.generatedId && <Button asChild variant="ghost" size="sm"><Link to={`/invoices/${run.generatedId}`}>Open invoice<ExternalLink className="ml-2 h-4 w-4" /></Link></Button>}</div>;
    })}
  </div></div>;
}

export default function Recurring() {
  const queryClient = useQueryClient();
  const customers = useCustomersQuery();
  const items = useItemsQuery();
  const vendors = useQuery({ queryKey: ['recurring-vendors'], queryFn: purchasesApi.listVendors });
  const bankAccounts = useQuery({ queryKey: ['recurring-bank-accounts'], queryFn: bankApi.listAccounts });
  const templates = useQuery({ queryKey: ['recurring-templates'], queryFn: recurringApi.list });
  const runs = useQuery({ queryKey: ['recurring-runs'], queryFn: () => recurringApi.runs() });
  const [error, setError] = useState('');
  const [kind, setKind] = useState<RecurringKind>('invoice');
  const [name, setName] = useState('Monthly invoice');
  const [customerId, setCustomerId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<InvoiceLineDraft[]>([newLine('line-1')]);
  const [repeat, setRepeat] = useState<RepeatSettings>(() => defaultRepeatSettings());

  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['recurring-templates'] }), queryClient.invalidateQueries({ queryKey: ['recurring-runs'] })]); };
  const action = useMutation({ mutationFn: ({ id, value }: { id: string; value: 'pause' | 'resume' | 'end' }) => recurringApi.action(id, value), onSuccess: refresh, onError: (cause) => setError(cause instanceof Error ? cause.message : 'Unable to update schedule') });
  const create = useMutation({ mutationFn: recurringApi.create, onSuccess: async () => { await refresh(); setError(''); }, onError: (cause) => setError(cause instanceof Error ? cause.message : 'Unable to create schedule') });

  const updateLine = (id: string, patch: Partial<InvoiceLineDraft>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  const chooseItem = (lineId: string, item: Item) => updateLine(lineId, { description: item.name, rate: item.enableSaleInfo && item.salePrice != null ? String(item.salePrice) : '0', taxRate: item.taxRate != null ? String(item.taxRate) : '0', unit: item.unit || 'ea' });
  const buildPayload = (): RecurringPayload => {
    const date = repeat.schedule.startDate;
    if (kind === 'invoice') return { kind: 'invoice', input: { customerId, date, dueDate: date, notes: notes || null, terms: terms || null, currency: 'NZD', status: 'draft', items: lines.map((line) => ({ description: line.description, quantity: line.quantity, unit: line.unit, rate: line.rate, rateUnit: line.unit, taxes: Number(line.taxRate) > 0 ? [{ id: `tax-${line.id}`, name: 'Tax', rate: line.taxRate }] : [] })) }, send: repeat.delivery };
    if (kind === 'bill') return { kind: 'bill', input: { vendorId, issueDate: date, dueDate: date, lines: [{ description, quantity: '1', unitPrice: amount, taxRate: '0' }] } };
    if (kind === 'income') return { kind: 'income', input: { bankAccountId, transactionDate: date, description, amount, type: 'credit' } };
    return { kind: 'expense', input: { description, amount, expenseDate: date } };
  };
  const submit = () => { setError(''); create.mutate({ name, payload: buildPayload(), schedule: repeat.schedule }); };
  const customerList = customers.data ?? [];
  const itemList = items.data?.items ?? [];
  const templateList = templates.data?.templates ?? [];
  const runList = runs.data?.runs ?? [];

  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <PageHeader title="Recurring schedules" description="Create repeat invoices and other documents, then track every generated record and its delivery state." />
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />New schedule</CardTitle></CardHeader><CardContent className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="schedule-name">Schedule name</Label><Input id="schedule-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="space-y-2"><Label>Document type</Label><Select value={kind} onValueChange={(value) => setKind(value as RecurringKind)}><SelectTrigger aria-label="Document type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="invoice">Invoice</SelectItem><SelectItem value="bill">Bill</SelectItem><SelectItem value="income">Income</SelectItem><SelectItem value="expense">Expense</SelectItem></SelectContent></Select></div></div>
      {kind === 'invoice' && <div className="space-y-5">
        <div className="space-y-2"><Label>Customer</Label><Select value={customerId} onValueChange={setCustomerId}><SelectTrigger aria-label="Customer"><SelectValue placeholder={customers.isLoading ? 'Loading customers…' : 'Choose a customer'} /></SelectTrigger><SelectContent>{customerList.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-3"><div className="flex items-center justify-between gap-3"><Label>Line items</Label><Button type="button" variant="outline" size="sm" aria-label="Add line" onClick={() => setLines((current) => [...current, newLine(`line-${current.length + 1}`)])}><Plus className="mr-2 h-4 w-4" />Add line</Button></div>
          {lines.map((line, index) => <div key={line.id} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[minmax(12rem,2fr)_6rem_8rem_7rem_auto] md:items-end">
            <div className="space-y-2"><Label htmlFor={`${line.id}-description`}>Description</Label><div className="flex gap-2"><Input id={`${line.id}-description`} aria-label={`Line ${index + 1} description`} value={line.description} onChange={(event) => updateLine(line.id, { description: event.target.value })} /><ItemSelector onItemSelect={(item) => chooseItem(line.id, item)} buttonClassName="shrink-0" refetch={() => undefined} /></div></div>
            <div className="space-y-2"><Label htmlFor={`${line.id}-quantity`}>Quantity</Label><Input id={`${line.id}-quantity`} aria-label={`Line ${index + 1} quantity`} inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor={`${line.id}-rate`}>Rate</Label><Input id={`${line.id}-rate`} aria-label={`Line ${index + 1} rate`} inputMode="decimal" value={line.rate} onChange={(event) => updateLine(line.id, { rate: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor={`${line.id}-tax`}>Tax %</Label><Input id={`${line.id}-tax`} aria-label={`Line ${index + 1} tax`} inputMode="decimal" value={line.taxRate} onChange={(event) => updateLine(line.id, { taxRate: event.target.value })} /></div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((candidate) => candidate.id !== line.id))}><Trash2 className="h-4 w-4" /></Button>
          </div>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="recurring-terms">Terms</Label><Textarea id="recurring-terms" value={terms} onChange={(event) => setTerms(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="recurring-notes">Notes</Label><Textarea id="recurring-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div></div>
        {itemList.length === 0 && !items.isLoading && <p className="text-sm text-muted-foreground">No saved items yet. You can still enter a line manually.</p>}
      </div>}
      {kind === 'bill' && <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Vendor</Label><Select value={vendorId} onValueChange={setVendorId}><SelectTrigger aria-label="Vendor"><SelectValue placeholder="Choose a vendor" /></SelectTrigger><SelectContent>{vendors.data?.map((vendor) => <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="bill-description">Description</Label><Input id="bill-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="bill-amount">Amount</Label><Input id="bill-amount" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></div>}
      {kind === 'income' && <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Bank account</Label><Select value={bankAccountId} onValueChange={setBankAccountId}><SelectTrigger aria-label="Bank account"><SelectValue placeholder="Choose an account" /></SelectTrigger><SelectContent>{bankAccounts.data?.map((account) => <SelectItem key={account.id} value={account.id}>{account.accountName}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="income-description">Description</Label><Input id="income-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="income-amount">Amount</Label><Input id="income-amount" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></div>}
      {kind === 'expense' && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="expense-description">Description</Label><Input id="expense-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="expense-amount">Amount</Label><Input id="expense-amount" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></div>}
      <RepeatSchedulePanel value={repeat} onChange={setRepeat} showDelivery={kind === 'invoice'} disabled={create.isPending} />
      <div className="flex justify-end"><Button disabled={create.isPending} onClick={submit}>{create.isPending ? 'Saving…' : 'Create schedule'}</Button></div>
    </CardContent></Card>
    <section aria-labelledby="existing-schedules-title" className="space-y-4"><h2 id="existing-schedules-title" className="text-xl font-semibold">Existing schedules</h2>
      {templates.isLoading ? <p className="text-sm text-muted-foreground">Loading schedules…</p> : templateList.length ? <div className="grid gap-4 lg:grid-cols-2">{templateList.map((template: RecurringTemplateDto) => {
        const templateRuns = runList.filter((run) => run.templateId === template.id);
        return <Card key={template.id}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{template.name}</h3><p className="mt-1 text-sm capitalize text-muted-foreground">{template.kind} · {template.schedule.frequency} · {template.schedule.timezone}</p></div><Badge variant="outline" className="capitalize">{template.status}</Badge></div><p className="mt-4 text-sm">Next: <span className="tabular-nums">{template.nextRunAt ? new Date(template.nextRunAt).toLocaleString() : 'No future runs'}</span></p><p className="text-sm text-muted-foreground">Created {template.occurrencesCreated} occurrence{template.occurrencesCreated === 1 ? '' : 's'}</p><div className="mt-4 flex flex-wrap gap-2">{template.status === 'active' && <Button variant="outline" aria-label={`Pause ${template.name}`} onClick={() => action.mutate({ id: template.id, value: 'pause' })}><Pause className="mr-2 h-4 w-4" />Pause</Button>}{template.status === 'paused' && <Button variant="outline" aria-label={`Resume ${template.name}`} onClick={() => action.mutate({ id: template.id, value: 'resume' })}><Play className="mr-2 h-4 w-4" />Resume</Button>}<Button variant="ghost" aria-label={`End ${template.name}`} disabled={template.status === 'ended'} onClick={() => action.mutate({ id: template.id, value: 'end' })}><Square className="mr-2 h-4 w-4" />End</Button></div><RunHistory runs={templateRuns} /></CardContent></Card>;
      })}</div> : <Card><CardContent className="flex min-h-48 flex-col items-center justify-center text-center"><CalendarClock className="h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">No recurring schedules</h3><p className="mt-1 text-sm text-muted-foreground">Create one above to automate regular work.</p></CardContent></Card>}
    </section>
  </div>;
}
