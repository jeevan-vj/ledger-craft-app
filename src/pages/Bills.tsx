import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BillDto } from '@ledgercraft/contracts';
import { Download, FilePlus2, Paperclip, Plus, RotateCcw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';
import { fileToBase64, objectsApi } from '@/features/storage/api/objectsApi';

function statusVariant(status: BillDto['displayStatus']): BadgeProps['variant'] {
  if (status === 'paid') return 'success';
  if (status === 'overdue' || status === 'void' || status === 'cancelled') return 'destructive';
  if (status === 'partial') return 'warning';
  if (status === 'received') return 'info';
  return 'secondary';
}

function formatMoney(value: string, currency: string) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(Number(value));
}

export default function Bills() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [paying, setPaying] = useState<BillDto | null>(null);
  const [allocations, setAllocations] = useState([{ bankAccountId: '', amount: '' }]);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const billsQuery = useQuery({ queryKey: ['bills'], queryFn: purchasesApi.listBills });
  const banksQuery = useQuery({ queryKey: ['bank-accounts', 'bill-payment'], queryFn: purchasesApi.listBankAccounts, enabled: Boolean(paying) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['bills'] });

  const receive = useMutation({ mutationFn: purchasesApi.receiveBill, onSuccess: async () => { await refresh(); toast.success('Bill received and posted'); }, onError: (error: Error) => toast.error(error.message) });
  const cancelBill = useMutation({ mutationFn: purchasesApi.cancelBill, onSuccess: async () => { await refresh(); toast.success('Bill cancelled'); }, onError: (error: Error) => toast.error(error.message) });
  const restoreBill = useMutation({ mutationFn: purchasesApi.restoreBill, onSuccess: async () => { await refresh(); toast.success('Bill restored'); }, onError: (error: Error) => toast.error(error.message) });
  const payment = useMutation({
    mutationFn: () => purchasesApi.recordPayment(paying!.id, allocations.length === 1
      ? { ...allocations[0], paymentDate }
      : { allocations, paymentDate }),
    onSuccess: async () => { await refresh(); setPaying(null); toast.success('Payment recorded'); },
    onError: (error: Error) => toast.error(error.message),
  });

  const bills = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (billsQuery.data ?? []).filter((bill) =>
      (status === 'all' || bill.displayStatus === status) &&
      (!needle || [bill.billNumber, bill.vendorName, bill.vendorReference].some((value) => value?.toLowerCase().includes(needle))));
  }, [billsQuery.data, search, status]);

  const startPayment = (bill: BillDto) => { setPaying(bill); setAllocations([{ bankAccountId: '', amount: bill.balanceDue }]); };
  const downloadCsv = async () => {
    const csv = await purchasesApi.exportBills();
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'bills.csv'; anchor.click(); URL.revokeObjectURL(url);
  };
  const attachFile = async (bill: BillDto, file: File) => {
    const uploaded = await objectsApi.upload({ kind: 'receipt', filename: file.name, contentType: file.type || 'application/pdf', contentBase64: await fileToBase64(file) });
    await purchasesApi.attachObject(bill.id, { objectKey: uploaded.key, filename: file.name, contentType: uploaded.contentType, size: uploaded.size });
    await refresh(); toast.success('Attachment added');
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Bills" description="Track supplier bills, due dates and accounts payable." actions={<div className="flex gap-2"><Button variant="outline" onClick={() => void downloadCsv()}><Download />Export CSV</Button><Button asChild><Link to="/bills/new"><Plus />New bill</Link></Button></div>} />
      {billsQuery.isLoading ? (
        <ContentPanel><div className="h-48 animate-pulse rounded-2xl bg-muted" aria-label="Loading bills" /></ContentPanel>
      ) : billsQuery.isError ? (
        <ContentPanel><p className="font-semibold">Bills could not be loaded</p><p className="mt-1 text-sm text-muted-foreground">{billsQuery.error.message}</p><Button variant="outline" className="mt-5" onClick={() => billsQuery.refetch()}>Try again</Button></ContentPanel>
      ) : (billsQuery.data?.length ?? 0) === 0 ? (
        <EmptyState title="Record your first supplier bill" description="Draft bills stay out of the ledger until you receive them." actions={[{ icon: FilePlus2, title: 'New bill', subtitle: 'Add supplier, due date, GST and account coding', to: '/bills/new' }]} />
      ) : (
        <ContentPanel padded={false}>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:p-6">
            <label className="relative flex-1"><span className="sr-only">Search bills</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bills" /></label>
            <Select value={status} onValueChange={setStatus}><SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="received">Received</SelectItem><SelectItem value="partial">Partial</SelectItem><SelectItem value="paid">Paid</SelectItem><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
          </div>
          <div className="hidden lg:block">
            <Table><TableHeader><TableRow><TableHead>Bill</TableHead><TableHead>Vendor</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Balance</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>{bills.map((bill) => <TableRow key={bill.id}>
                <TableCell><p className="font-semibold">{bill.billNumber}</p><p className="text-xs text-muted-foreground">{bill.vendorReference ?? 'No vendor reference'} · {bill.attachments.length} files</p><p className="text-xs text-muted-foreground">{bill.history[0]?.summary}</p></TableCell>
                <TableCell>{bill.vendorName}</TableCell><TableCell>{new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium' }).format(new Date(`${bill.dueDate}T00:00:00`))}</TableCell>
                <TableCell><Badge variant={statusVariant(bill.displayStatus)} className="capitalize">{bill.displayStatus}</Badge></TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatMoney(bill.balanceDue, bill.currency)}</TableCell>
                <TableCell><div className="flex justify-end gap-2"><label className="inline-flex cursor-pointer items-center"><input className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => event.target.files?.[0] && void attachFile(bill, event.target.files[0])} /><Button variant="ghost" size="icon" asChild><span title="Attach file"><Paperclip /></span></Button></label>{bill.lifecycleStatus === 'draft' && <><Button variant="outline" size="sm" asChild><Link to={`/bills/${bill.id}/edit`}>Edit</Link></Button><Button size="sm" onClick={() => receive.mutate(bill.id)} disabled={receive.isPending}>Receive</Button></>}{bill.lifecycleStatus === 'received' && bill.paymentStatus !== 'paid' && <Button size="sm" onClick={() => startPayment(bill)}>Record payment</Button>}{bill.lifecycleStatus === 'received' && bill.paymentStatus === 'unpaid' && <Button variant="ghost" size="sm" onClick={() => window.confirm(`Cancel ${bill.billNumber}?`) && cancelBill.mutate(bill.id)}>Cancel</Button>}{bill.lifecycleStatus === 'void' && <Button variant="outline" size="sm" onClick={() => restoreBill.mutate(bill.id)}><RotateCcw />Restore</Button>}</div></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
          <div className="divide-y divide-border lg:hidden">{bills.map((bill) => <div key={bill.id} className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{bill.vendorName}</p><p className="text-sm text-muted-foreground">{bill.billNumber} · due {bill.dueDate}</p><p className="text-xs text-muted-foreground">{bill.attachments.length} files · {bill.history[0]?.summary}</p></div><Badge variant={statusVariant(bill.displayStatus)} className="capitalize">{bill.displayStatus}</Badge></div><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Balance due</span><span className="font-semibold tabular-nums">{formatMoney(bill.balanceDue, bill.currency)}</span></div><div className="flex flex-wrap gap-2"><label className="inline-flex min-h-11 flex-1 cursor-pointer items-center"><input className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => event.target.files?.[0] && void attachFile(bill, event.target.files[0])} /><Button className="w-full" variant="outline" asChild><span><Paperclip />Attach</span></Button></label>{bill.lifecycleStatus === 'draft' && <><Button className="flex-1" variant="outline" asChild><Link to={`/bills/${bill.id}/edit`}>Edit</Link></Button><Button className="flex-1" onClick={() => receive.mutate(bill.id)}>Receive</Button></>}{bill.lifecycleStatus === 'received' && bill.paymentStatus !== 'paid' && <Button className="flex-1" onClick={() => startPayment(bill)}>Record payment</Button>}{bill.lifecycleStatus === 'received' && bill.paymentStatus === 'unpaid' && <Button className="flex-1" variant="ghost" onClick={() => window.confirm(`Cancel ${bill.billNumber}?`) && cancelBill.mutate(bill.id)}>Cancel</Button>}{bill.lifecycleStatus === 'void' && <Button className="flex-1" variant="outline" onClick={() => restoreBill.mutate(bill.id)}><RotateCcw />Restore</Button>}</div></div>)}</div>
        </ContentPanel>
      )}

      <Dialog open={Boolean(paying)} onOpenChange={(open) => !open && setPaying(null)}><DialogContent className="rounded-2xl"><DialogHeader><DialogTitle>Record bill payment</DialogTitle><DialogDescription>{paying ? `${paying.billNumber} · ${formatMoney(paying.balanceDue, paying.currency)} due` : ''}</DialogDescription></DialogHeader><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); payment.mutate(); }}>{allocations.map((allocation, index) => <div key={index} className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Paid from</Label><Select value={allocation.bankAccountId} onValueChange={(value) => setAllocations((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, bankAccountId: value } : row))}><SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger><SelectContent>{banksQuery.data?.map((bank) => <SelectItem key={bank.id} value={bank.id}>{bank.accountName}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor={`bill-payment-amount-${index}`}>Amount</Label><Input id={`bill-payment-amount-${index}`} inputMode="decimal" required value={allocation.amount} onChange={(event) => setAllocations((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value } : row))} /></div></div>)}<Button type="button" variant="ghost" onClick={() => setAllocations((rows) => [...rows, { bankAccountId: '', amount: '' }])}>Split across another account</Button><div className="space-y-2"><Label htmlFor="bill-payment-date">Payment date</Label><Input id="bill-payment-date" type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setPaying(null)}>Cancel</Button><Button type="submit" disabled={allocations.some((row) => !row.bankAccountId || !row.amount) || payment.isPending}>{payment.isPending ? 'Recording…' : `Record ${allocations.length} allocation${allocations.length === 1 ? '' : 's'}`}</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  );
}
