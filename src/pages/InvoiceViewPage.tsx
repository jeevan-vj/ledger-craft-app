import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAppData } from '@/hooks/useAppData';
import InvoicePreview from '@/components/invoice/preview/InvoicePreview';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Archive, ChevronLeft, Copy, FileUp, Printer, RotateCcw, XCircle } from 'lucide-react';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';
import { fileToBase64, objectsApi } from '@/features/storage/api/objectsApi';
import type { InvoiceAttachmentDto, InvoiceHistoryDto } from '@ledgercraft/contracts';
import { toast } from 'sonner';

const InvoiceViewPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { invoices, isLoadingInvoices } = useAppData();
  const [attachments, setAttachments] = useState<InvoiceAttachmentDto[]>([]);
  const [history, setHistory] = useState<InvoiceHistoryDto[]>([]);
  const [busy, setBusy] = useState(false);

  const invoice = invoices.find((inv) => inv.id === id);

  useEffect(() => {
    if (!id) return;
    void Promise.all([invoicesApi.attachments(id), invoicesApi.history(id)]).then(([files, events]) => {
      setAttachments(files); setHistory(events);
    }).catch(() => undefined);
  }, [id]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try { await action(); toast.success(message); window.location.reload(); }
    catch (error) { toast.error('Action failed', { description: error instanceof Error ? error.message : 'Try again.' }); }
    finally { setBusy(false); }
  };

  const uploadAttachment = async (file?: File) => {
    if (!file || !id) return;
    setBusy(true);
    try {
      const object = await objectsApi.upload({ kind: 'invoice', filename: file.name, contentType: file.type, contentBase64: await fileToBase64(file) });
      const attached = await invoicesApi.attach(id, { objectKey: object.key, filename: file.name, contentType: file.type, size: file.size });
      setAttachments((current) => [attached, ...current]);
      toast.success('Attachment added');
    } catch (error) { toast.error('Upload failed', { description: error instanceof Error ? error.message : 'Try again.' }); }
    finally { setBusy(false); }
  };

  if (isLoadingInvoices) {
    return <div className="flex justify-center items-center h-64">Loading invoice...</div>;
  }

  if (!invoice) {
    return (
      <Card className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <div>Invoice not found.</div>
        <Button className="mt-4" onClick={() => navigate(-1)}>
          <ChevronLeft className="mr-2 w-4 h-4" /> Back
        </Button>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl mx-auto mt-8">
      <Button variant="ghost" className="mb-4 print:hidden" onClick={() => navigate(-1)}>
        <ChevronLeft className="mr-2 w-4 h-4" /> Back to Invoices
      </Button>
      <Card className="mb-6 p-4 print:hidden">
        <div className="flex flex-wrap gap-2" aria-label="Invoice lifecycle actions">
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const copy = await invoicesApi.duplicate(invoice.id); navigate(`/invoices/${copy.id}`); }, 'Invoice duplicated')}><Copy className="mr-2 h-4 w-4" />Duplicate</Button>
          {invoice.status === 'cancelled' ? (
            <Button variant="outline" disabled={busy} onClick={() => void run(() => invoicesApi.restore(invoice.id), 'Invoice restored')}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button>
          ) : (
            <Button variant="outline" disabled={busy || Number(invoice.totalPaid ?? 0) > 0} onClick={() => void run(() => invoicesApi.cancel(invoice.id, 'Cancelled from invoice detail'), 'Invoice cancelled')}><XCircle className="mr-2 h-4 w-4" />Cancel</Button>
          )}
          <Button variant="outline" disabled={busy || !['draft', 'cancelled'].includes(invoice.status)} onClick={() => void run(async () => { await invoicesApi.archive(invoice.id); navigate('/invoices'); }, 'Invoice archived')}><Archive className="mr-2 h-4 w-4" />Archive</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
          <Button variant="outline" asChild><label className="cursor-pointer"><FileUp className="mr-2 h-4 w-4" />Attach file<input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => void uploadAttachment(event.target.files?.[0])} /></label></Button>
        </div>
        <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
          <section className="min-w-0"><h2 className="font-semibold">Attachments</h2>{attachments.length ? <ul className="mt-2 space-y-1 text-sm">{attachments.map((file) => <li key={file.id} className="truncate">{file.filename} · {Math.ceil(file.size / 1024)} KB</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No private files attached.</p>}</section>
          <section className="min-w-0"><h2 className="font-semibold">History</h2><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{history.slice(0, 5).map((event) => <li key={event.id}>{event.action.replace('_', ' ')} · {new Date(event.createdAt).toLocaleString()}</li>)}</ul></section>
        </div>
      </Card>
      {invoice.sourceQuoteId && invoice.sourceQuoteNumber ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Converted from quote{' '}
          <Link to={`/quotes/${invoice.sourceQuoteId}`} className="font-medium text-primary underline">
            {invoice.sourceQuoteNumber}
          </Link>
        </p>
      ) : null}
      <InvoicePreview 
        invoice={invoice} 
        selectedTemplate={(invoice.templateName as any) || "classic"} 
      />
    </div>
  );
};

export default InvoiceViewPage;
