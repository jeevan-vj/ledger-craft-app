import { useEffect, useMemo, useState } from 'react';
import type { BankTransactionDetailsRequest, BankTransactionDto } from '@ledgercraft/contracts';
import { Download, FileDown, Link2, Plus, Printer, Split, Upload, X } from 'lucide-react';
import { bankApi } from '@/features/bank/api/bankApi';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';
import { objectsApi } from '@/features/storage/api/objectsApi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

interface Props {
  transaction: BankTransactionDto | null;
  accountName?: string;
  currency?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}

interface SplitDraft { category: string; description: string; amount: string }
interface ConnectionDraft { documentType: 'invoice' | 'bill'; documentId: string; amount: string }

export function BankTransactionDetails({ transaction, accountName, currency = 'NZD', open, onOpenChange, onChanged }: Props) {
  const [allocating, setAllocating] = useState(false);
  const [splits, setSplits] = useState<SplitDraft[]>([{ category: '', description: '', amount: '' }]);
  const [connections, setConnections] = useState<ConnectionDraft[]>([]);
  const [documentId, setDocumentId] = useState('');
  const [documentAmount, setDocumentAmount] = useState('');
  const [documents, setDocuments] = useState<Array<{ id: string; number: string; balance: string; type: 'invoice' | 'bill' }>>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const hasDetails = Boolean(transaction && (transaction.splits.length || transaction.documentConnections.length || transaction.attachments.length));

  useEffect(() => {
    if (!allocating || !transaction) return;
    const load = async () => {
      if (transaction.type === 'credit') {
        const invoices = await invoicesApi.list();
        setDocuments(invoices.filter((invoice) => invoice.balanceDue > 0).map((invoice) => ({
          id: invoice.id, number: invoice.invoiceNumber, balance: String(invoice.balanceDue), type: 'invoice' as const,
        })));
      } else {
        const bills = await purchasesApi.listBills();
        setDocuments(bills.filter((bill) => bill.lifecycleStatus === 'received' && bill.balanceDue !== '0.00').map((bill) => ({
          id: bill.id, number: bill.billNumber, balance: bill.balanceDue, type: 'bill' as const,
        })));
      }
    };
    void load().catch((error) => toast.error(error instanceof Error ? error.message : 'Could not load documents'));
  }, [allocating, transaction]);

  const availableDocuments = useMemo(() => documents.filter((document) => !connections.some((connection) => connection.documentId === document.id)), [connections, documents]);
  if (!transaction) return null;

  const duplicate = async () => {
    try { await bankApi.duplicateTransaction(transaction.id); toast.success('Transaction duplicated'); await onChanged(); onOpenChange(false); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not duplicate transaction'); }
  };

  const downloadPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF();
    pdf.setFontSize(18); pdf.text('Bank transaction', 20, 24);
    pdf.setFontSize(11);
    const rows = [
      ['Account', accountName ?? transaction.bankAccountId], ['Date', transaction.transactionDate],
      ['Description', transaction.description], ['Direction', transaction.type], ['Amount', `${currency} ${transaction.amount}`],
      ['Counterparty', transaction.counterparty ?? '—'], ['Reference', transaction.reference ?? '—'],
      ['Category', transaction.category ?? '—'], ['Source', transaction.source], ['Reconciled', transaction.isReconciled ? 'Yes' : 'No'],
    ];
    rows.forEach(([label, value], index) => pdf.text(`${label}: ${value}`, 20, 38 + index * 8));
    pdf.save(`Bank-transaction-${transaction.transactionDate}-${transaction.id.slice(0, 8)}.pdf`);
  };

  const saveDetails = async () => {
    setSaving(true);
    try {
      const attachments: BankTransactionDetailsRequest['attachments'] = [];
      for (const file of files) {
        const uploaded = await objectsApi.uploadFile(file, 'bank_attachment');
        if (!uploaded) throw new Error(`Could not upload ${file.name}`);
        attachments.push({ objectKey: uploaded.path, filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size });
      }
      await bankApi.saveTransactionDetails(transaction.id, {
        splits: splits.filter((split) => split.category.trim() || split.amount.trim()).map((split) => ({
          category: split.category.trim(), description: split.description.trim() || null, amount: split.amount.trim(),
        })),
        documentConnections: connections,
        attachments,
      });
      toast.success('Transaction details saved'); setAllocating(false); await onChanged(); onOpenChange(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save transaction details'); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
    <DialogHeader><DialogTitle>{transaction.description}</DialogTitle><DialogDescription>{accountName} · {transaction.transactionDate}</DialogDescription></DialogHeader>
    {!allocating ? <div className="space-y-5 print:p-6">
      <div className="grid gap-3 rounded-2xl bg-muted p-4 sm:grid-cols-2"><Detail label="Amount" value={`${transaction.type === 'debit' ? '−' : '+'}${currency} ${transaction.amount}`} /><Detail label="Direction" value={transaction.type === 'credit' ? 'Income' : 'Expense'} /><Detail label="Counterparty" value={transaction.counterparty || '—'} /><Detail label="Reference" value={transaction.reference || '—'} /><Detail label="Category" value={transaction.category || 'Uncategorised'} /><Detail label="Status" value={transaction.isReconciled ? 'Reconciled' : 'Unreconciled'} /></div>
      {transaction.splits.length ? <Section title="Split allocation">{transaction.splits.map((split) => <Row key={split.id} label={split.category} value={`${currency} ${split.amount}`} />)}</Section> : null}
      {transaction.documentConnections.length ? <Section title="Connected documents">{transaction.documentConnections.map((connection) => <Row key={connection.id} label={`${connection.documentType === 'invoice' ? 'Invoice' : 'Bill'} ${connection.documentNumber}`} value={`${currency} ${connection.amount}`} />)}</Section> : null}
      {transaction.attachments.length ? <Section title="Attachments">{transaction.attachments.map((attachment) => <button key={attachment.id} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-muted" onClick={() => window.open(`/api/objects?key=${encodeURIComponent(attachment.objectKey)}`, '_blank')}><span>{attachment.filename}</span><Download className="h-4 w-4" /></button>)}</Section> : null}
      <div className="flex flex-wrap gap-2 print:hidden"><Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button><Button variant="outline" onClick={() => void downloadPdf()}><FileDown className="mr-2 h-4 w-4" />Download PDF</Button>{transaction.source !== 'transfer' ? <Button variant="outline" onClick={() => void duplicate()}><Plus className="mr-2 h-4 w-4" />Duplicate</Button> : null}{!hasDetails && transaction.source !== 'transfer' ? <Button onClick={() => setAllocating(true)}><Split className="mr-2 h-4 w-4" />Allocate & attach</Button> : null}</div>
    </div> : <div className="space-y-6">
      <Section title="Split allocation"><p className="mb-3 text-sm text-muted-foreground">When used, split amounts must total {currency} {transaction.amount} exactly.</p>{splits.map((split, index) => <div key={index} className="mb-3 grid gap-2 rounded-xl bg-muted p-3 sm:grid-cols-[1fr_1fr_130px_auto]"><Input aria-label={`Split ${index + 1} category`} placeholder="Category" value={split.category} onChange={(event) => setSplits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value } : item))} /><Input aria-label={`Split ${index + 1} description`} placeholder="Description" value={split.description} onChange={(event) => setSplits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} /><Input aria-label={`Split ${index + 1} amount`} inputMode="decimal" placeholder="0.00" value={split.amount} onChange={(event) => setSplits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} /><Button size="icon" variant="ghost" aria-label={`Remove split ${index + 1}`} onClick={() => setSplits((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-4 w-4" /></Button></div>)}<Button size="sm" variant="outline" onClick={() => setSplits((current) => [...current, { category: '', description: '', amount: '' }])}><Plus className="mr-2 h-4 w-4" />Add split</Button></Section>
      <Section title="Connect documents"><div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"><Select value={documentId} onValueChange={setDocumentId}><SelectTrigger><SelectValue placeholder={transaction.type === 'credit' ? 'Choose invoice' : 'Choose received bill'} /></SelectTrigger><SelectContent>{availableDocuments.map((document) => <SelectItem key={document.id} value={document.id}>{document.number} · due {document.balance}</SelectItem>)}</SelectContent></Select><Input aria-label="Connection amount" inputMode="decimal" placeholder="0.00" value={documentAmount} onChange={(event) => setDocumentAmount(event.target.value)} /><Button type="button" variant="outline" disabled={!documentId || !documentAmount} onClick={() => { const document = documents.find((item) => item.id === documentId); if (!document) return; setConnections((current) => [...current, { documentType: document.type, documentId, amount: documentAmount }]); setDocumentId(''); setDocumentAmount(''); }}><Link2 className="mr-2 h-4 w-4" />Connect</Button></div>{connections.map((connection) => <Row key={connection.documentId} label={documents.find((document) => document.id === connection.documentId)?.number || connection.documentId} value={`${currency} ${connection.amount}`} />)}</Section>
      <Section title="Attachments"><Label htmlFor="bank-attachments" className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border p-4"><Upload className="h-4 w-4" />Choose images or PDFs up to 1 MB each</Label><Input id="bank-attachments" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />{files.map((file) => <Row key={`${file.name}-${file.size}`} label={file.name} value={`${Math.ceil(file.size / 1024)} KB`} />)}</Section>
      <DialogFooter><Button variant="outline" onClick={() => setAllocating(false)}>Back</Button><Button disabled={saving} onClick={() => void saveDetails()}>{saving ? 'Saving…' : 'Save details'}</Button></DialogFooter>
    </div>}
  </DialogContent></Dialog>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="font-semibold tabular-nums">{value}</p></div>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 py-2 text-sm"><span>{label}</span><span className="font-semibold tabular-nums">{value}</span></div>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <div><div className="mb-2 flex items-center gap-3"><h3 className="font-semibold">{title}</h3><Separator className="flex-1" /></div>{children}</div>; }
