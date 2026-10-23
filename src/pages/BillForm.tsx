import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BillLineInput, CreateBillRequest } from '@ledgercraft/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';

const newLine = (): BillLineInput => ({ description: '', quantity: '1', unitPrice: '0', taxRate: '15', accountId: null });
const today = new Date().toISOString().slice(0, 10);
const defaultDue = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);

export default function BillForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateBillRequest>({ vendorId: '', vendorReference: null, issueDate: today, dueDate: defaultDue, currency: 'NZD', taxInclusive: true, notes: null, lines: [newLine()] });
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: purchasesApi.listVendors });
  const accounts = useQuery({ queryKey: ['accounts', 'bill-form'], queryFn: purchasesApi.listAccounts });
  const existing = useQuery({ queryKey: ['bills', id], queryFn: () => purchasesApi.getBill(id!), enabled: Boolean(id) });

  useEffect(() => {
    if (!existing.data) return;
    setForm({
      vendorId: existing.data.vendorId,
      vendorReference: existing.data.vendorReference,
      issueDate: existing.data.issueDate,
      dueDate: existing.data.dueDate,
      currency: existing.data.currency,
      taxInclusive: existing.data.taxInclusive,
      notes: existing.data.notes,
      lines: existing.data.lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate, accountId: line.accountId })),
    });
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => id ? purchasesApi.updateBill(id, form) : purchasesApi.createBill(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      toast.success(id ? 'Draft bill updated' : 'Draft bill created');
      navigate('/bills');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totals = useMemo(() => form.lines.reduce((result, line) => {
    const base = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
    const rate = Number(line.taxRate) || 0;
    const tax = form.taxInclusive ? (rate ? base * rate / (100 + rate) : 0) : base * rate / 100;
    return { subtotal: result.subtotal + (form.taxInclusive ? base - tax : base), tax: result.tax + tax, total: result.total + (form.taxInclusive ? base : base + tax) };
  }, { subtotal: 0, tax: 0, total: 0 }), [form.lines, form.taxInclusive]);

  const updateLine = (index: number, patch: Partial<BillLineInput>) => setForm((current) => ({ ...current, lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) }));
  const ready = form.vendorId && form.issueDate && form.dueDate && form.lines.every((line) => line.description.trim() && Number(line.quantity) > 0 && Number(line.unitPrice) >= 0);

  if (id && existing.isLoading) return <ContentPanel><div className="h-72 animate-pulse rounded-2xl bg-muted" /></ContentPanel>;

  return (
    <div className="space-y-6">
      <PageHeader title={id ? 'Edit bill' : 'New bill'} description="Save a draft now. It reaches the ledger only when you receive it." backTo="/bills" />
      <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <ContentPanel>
          <h2 className="text-xl font-semibold">Bill details</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="space-y-2"><Label>Vendor</Label><Select value={form.vendorId} onValueChange={(vendorId) => {
              const vendor = vendors.data?.find((item) => item.id === vendorId);
              const due = new Date(`${form.issueDate}T00:00:00`); due.setDate(due.getDate() + (vendor?.paymentTermDays ?? 20));
              setForm({ ...form, vendorId, dueDate: due.toISOString().slice(0, 10), lines: form.lines.map((line) => ({ ...line, accountId: line.accountId ?? vendor?.defaultAccountId ?? null, taxRate: line.taxRate === '15' ? vendor?.defaultTaxRate ?? line.taxRate : line.taxRate })) });
            }}><SelectTrigger><SelectValue placeholder="Choose a vendor" /></SelectTrigger><SelectContent>{vendors.data?.filter((vendor) => vendor.isActive || vendor.id === form.vendorId).map((vendor) => <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="vendor-reference">Vendor reference</Label><Input id="vendor-reference" value={form.vendorReference ?? ''} onChange={(event) => setForm({ ...form, vendorReference: event.target.value || null })} /></div>
            <div className="space-y-2"><Label htmlFor="bill-date">Bill date</Label><Input id="bill-date" type="date" required value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="bill-due-date">Due date</Label><Input id="bill-due-date" type="date" required value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></div>
          </div>
          <label className="mt-5 flex min-h-11 items-center gap-3 text-sm font-medium"><Checkbox checked={form.taxInclusive} onCheckedChange={(checked) => setForm({ ...form, taxInclusive: checked === true })} />Prices include GST</label>
        </ContentPanel>

        <ContentPanel>
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Line items</h2><p className="mt-1 text-sm text-muted-foreground">Choose an expense or asset account before receiving the bill.</p></div><Button type="button" variant="outline" onClick={() => setForm({ ...form, lines: [...form.lines, newLine()] })}><Plus />Add line</Button></div>
          <div className="mt-6 space-y-4">{form.lines.map((line, index) => (
            <div key={index} className="grid gap-4 rounded-2xl bg-muted/50 p-4 md:grid-cols-[minmax(12rem,2fr)_6rem_8rem_7rem_minmax(10rem,1fr)_2.5rem] md:items-end">
              <div className="space-y-2"><Label htmlFor={`line-description-${index}`}>Description</Label><Input id={`line-description-${index}`} required value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor={`line-quantity-${index}`}>Quantity</Label><Input id={`line-quantity-${index}`} inputMode="decimal" required value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor={`line-price-${index}`}>Unit price</Label><Input id={`line-price-${index}`} inputMode="decimal" required value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor={`line-tax-${index}`}>GST %</Label><Input id={`line-tax-${index}`} inputMode="decimal" value={line.taxRate} onChange={(event) => updateLine(index, { taxRate: event.target.value })} /></div>
              <div className="space-y-2"><Label>Account</Label><Select value={line.accountId ?? ''} onValueChange={(accountId) => updateLine(index, { accountId })}><SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger><SelectContent>{accounts.data?.filter((account) => ['expense', 'asset'].includes(account.accountClass ?? '') || account.type === 'expense').map((account) => <SelectItem key={account.id} value={account.id}>{account.accountNumber ? `${account.accountNumber} · ` : ''}{account.name}</SelectItem>)}</SelectContent></Select></div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${index + 1}`} disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, lineIndex) => lineIndex !== index) })}><Trash2 /></Button>
            </div>
          ))}</div>
        </ContentPanel>

        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <ContentPanel><Label htmlFor="bill-notes">Notes</Label><Textarea id="bill-notes" className="mt-2" rows={5} value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value || null })} /></ContentPanel>
          <ContentPanel><dl className="space-y-3 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">${totals.subtotal.toFixed(2)}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">GST</dt><dd className="tabular-nums">${totals.tax.toFixed(2)}</dd></div><div className="flex justify-between border-t border-border pt-4 text-lg font-semibold"><dt>Total</dt><dd className="tabular-nums">${totals.total.toFixed(2)}</dd></div></dl></ContentPanel>
        </div>
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => navigate('/bills')}>Cancel</Button><Button type="submit" disabled={!ready || save.isPending}>{save.isPending ? 'Saving…' : 'Save draft'}</Button></div>
      </form>
    </div>
  );
}
