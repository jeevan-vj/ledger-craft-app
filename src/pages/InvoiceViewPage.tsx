import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAppData } from '@/hooks/useAppData';
import InvoicePreview from '@/components/invoice/preview/InvoicePreview';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Archive, ChevronLeft, Copy, CreditCard, Download, FileText, FileUp, Printer, RotateCcw, Share2, XCircle } from 'lucide-react';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';
import { fileToBase64, objectsApi } from '@/features/storage/api/objectsApi';
import type { InvoiceAttachmentDto, InvoiceHistoryDto } from '@ledgercraft/contracts';
import { toast } from 'sonner';
import ShareInvoiceModal from '@/components/invoice/ShareInvoiceModal';
import { getServerCapabilities } from '@/services/capabilitiesService';
import { StripePaymentLinkDialog } from '@/components/invoice/StripePaymentLinkDialog';
import { InvoiceCreditNotesPanel } from '@/components/accounting/InvoiceCreditNotesPanel';
import { settlementLabel } from '@/features/accounting-completion/settlementLabel';
import type { InvoiceTemplateId } from '@/components/invoice/templates/InvoiceTemplates';

const InvoiceViewPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { invoices, isLoadingInvoices, businessProfile, refreshInvoices } = useAppData();
  const [attachments, setAttachments] = useState<InvoiceAttachmentDto[]>([]);
  const [history, setHistory] = useState<InvoiceHistoryDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [stripeAvailable, setStripeAvailable] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [cardPaymentOpen, setCardPaymentOpen] = useState(false);

  useEffect(() => {
    void getServerCapabilities().then((value) => {
      setEmailAvailable(value.email === 'available');
      setStripeAvailable(value.stripe === 'available');
    });
  }, []);

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
      {!emailAvailable && (
        <Card className="mb-6 p-5 print:hidden">
          <h2 className="font-semibold">Delivery</h2>
          <p className="mt-1 text-sm text-muted-foreground">Email isn't set up on this server yet. Share a secure invoice link instead.</p>
          <Button className="mt-4" onClick={() => setShareOpen(true)}><Share2 className="mr-2 h-4 w-4" />Share link instead</Button>
        </Card>
      )}
      <Card className="mb-6 p-4 print:hidden">
        <div className="flex flex-wrap gap-2" aria-label="Invoice lifecycle actions">
          <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const copy = await invoicesApi.duplicate(invoice.id); navigate(`/invoices/${copy.id}`); }, 'Invoice duplicated')}><Copy className="mr-2 h-4 w-4" />Duplicate</Button>
          {invoice.status === 'cancelled' ? (
            <Button variant="outline" disabled={busy} onClick={() => void run(() => invoicesApi.restore(invoice.id), 'Invoice restored')}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button>
          ) : (
            <Button variant="outline" disabled={busy || Number(invoice.totalPaid ?? 0) > 0 || Number(invoice.totalCredited ?? 0) > 0} onClick={() => void run(() => invoicesApi.cancel(invoice.id, 'Cancelled from invoice detail'), 'Invoice cancelled')}><XCircle className="mr-2 h-4 w-4" />Cancel</Button>
          )}
          <Button variant="outline" disabled={busy || !['draft', 'cancelled'].includes(invoice.status)} onClick={() => void run(async () => { await invoicesApi.archive(invoice.id); navigate('/invoices'); }, 'Invoice archived')}><Archive className="mr-2 h-4 w-4" />Archive</Button>
          <Button variant="outline" aria-expanded={creditsOpen} onClick={() => setCreditsOpen((open) => !open)}><FileText className="mr-2 h-4 w-4" />Credit notes and refunds</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
          {stripeAvailable && invoice.currency?.toUpperCase() === 'NZD' && invoice.status !== 'cancelled' && Number(invoice.balanceDue) > 0 && <Button variant="outline" onClick={() => setCardPaymentOpen(true)}><CreditCard className="mr-2 h-4 w-4" />Card payment</Button>}
          <Button variant="outline" asChild><label className="cursor-pointer"><FileUp className="mr-2 h-4 w-4" />Attach file<input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => void uploadAttachment(event.target.files?.[0])} /></label></Button>
        </div>
        <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
          <section className="min-w-0"><h2 className="font-semibold">Attachments</h2>{attachments.length ? <ul className="mt-2 space-y-1 text-sm">{attachments.map((file) => <li key={file.id} className="truncate">{file.filename} · {Math.ceil(file.size / 1024)} KB</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No private files attached.</p>}</section>
          <section className="min-w-0"><h2 className="font-semibold">History</h2><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{history.slice(0, 5).map((event) => <li key={event.id}>{event.action.replace('_', ' ')} · {new Date(event.createdAt).toLocaleString()}</li>)}</ul></section>
        </div>
      </Card>
      {invoice.sourceImportDocumentId ? (
        <Card className="mb-6 border border-border p-5 print:hidden">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#9FE870] text-[#163300]"><FileText /></span><div className="min-w-0"><h2 className="font-semibold">Source document</h2><p className="mt-1 text-sm text-muted-foreground">{invoice.externalIssuerName ? `Imported from a document issued by ${invoice.externalIssuerName}.` : 'This draft was created from an imported document.'}{invoice.externalNumber ? ` External number ${invoice.externalNumber}.` : ''}</p></div></div>
            <Button variant="outline" asChild><a href={`/api/invoice-imports/${invoice.sourceImportDocumentId}/file`} download><Download />Download original</a></Button>
          </div>
        </Card>
      ) : null}
      {invoice.sourceQuoteId && invoice.sourceQuoteNumber ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Converted from quote{' '}
          <Link to={`/quotes/${invoice.sourceQuoteId}`} className="font-medium text-primary underline">
            {invoice.sourceQuoteNumber}
          </Link>
        </p>
      ) : null}
      {Number(invoice.totalCredited ?? 0) > 0 && <Card className="mb-6 space-y-2 p-5"><h2 className="font-semibold">{settlementLabel(invoice) ?? 'Partly credited'}</h2><p className="text-sm tabular-nums">Cash received: {invoice.currency} {invoice.totalPaid?.toFixed(2) ?? 'Unavailable'} · Credit notes: {invoice.currency} {invoice.totalCredited?.toFixed(2)} · Balance due: {invoice.currency} {invoice.balanceDue?.toFixed(2) ?? 'Unavailable'}</p></Card>}
      {creditsOpen && <div className="mb-6"><InvoiceCreditNotesPanel invoiceId={invoice.id} currency={invoice.currency} canIssue={!['draft', 'cancelled'].includes(invoice.status)} onChanged={() => void refreshInvoices()} /></div>}
      <InvoicePreview 
        invoice={invoice} 
        selectedTemplate={(invoice.templateName as InvoiceTemplateId) || "classic"}
      />
      <ShareInvoiceModal open={shareOpen} onOpenChange={setShareOpen} invoice={invoice} businessName={businessProfile?.name} />
      {stripeAvailable && invoice.currency?.toUpperCase() === 'NZD' && invoice.status !== 'cancelled' && Number(invoice.balanceDue) > 0 ? <StripePaymentLinkDialog open={cardPaymentOpen} onOpenChange={setCardPaymentOpen} invoice={{ id: invoice.id, invoiceNumber: invoice.invoiceNumber, balanceDue: Number(invoice.balanceDue), currency: invoice.currency }} /> : null}
    </div>
  );
};

export default InvoiceViewPage;
