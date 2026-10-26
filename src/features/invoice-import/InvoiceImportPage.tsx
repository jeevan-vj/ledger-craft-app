import { useEffect, useRef, useState } from 'react';
import type { InvoiceImportDraftPatch, InvoiceImportDraftResponse, InvoiceImportDocumentDto } from '@ledgercraft/contracts';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, FileSearch, LockKeyhole, RotateCcw } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { businessProfileApi } from '@/features/business-profile/api/businessProfileApi';
import { customersApi } from '@/features/customers/api/customersApi';
import { purchasesApi } from '@/features/purchases/api/purchasesApi';
import { usePermissions } from '@/hooks/usePermissions';
import { invoiceImportApi } from './api/invoiceImportApi';
import { InvoiceImportDropzone } from './InvoiceImportDropzone';
import { InvoiceImportReview } from './InvoiceImportReview';
import { validateInvoiceImportFile } from './invoiceImportFile';

type Stage = 'idle' | 'uploading' | 'extracting' | 'review' | 'error';

function ImportDenied() {
  return <div className="mx-auto max-w-2xl py-10"><ContentPanel><div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"><LockKeyhole /></div><h1 className="mt-5 text-3xl font-bold tracking-tight">Import access restricted</h1><p className="mt-3 text-muted-foreground">You don't have permission to import invoices</p><p className="mt-1 text-sm text-muted-foreground">Ask an owner or administrator to import this document.</p><Button variant="outline" asChild className="mt-6"><Link to="/invoices"><ArrowLeft />Back to invoices</Link></Button></ContentPanel></div>;
}

function ImportWorkspace() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [document, setDocument] = useState<InvoiceImportDocumentDto | null>(null);
  const [review, setReview] = useState<InvoiceImportDraftResponse | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const customers = useQuery({ queryKey: ['customers', 'invoice-import'], queryFn: customersApi.list, enabled: stage === 'review' });
  const vendors = useQuery({ queryKey: ['vendors', 'invoice-import'], queryFn: purchasesApi.listVendors, enabled: stage === 'review' });
  const profile = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get, enabled: stage === 'review' });

  useEffect(() => { headingRef.current?.focus(); }, [stage]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const begin = async (selected: File) => {
    const validation = validateInvoiceImportFile(selected);
    setFile(selected);
    setError(validation);
    if (validation) return;
    try {
      setStage('uploading');
      const uploaded = await invoiceImportApi.upload(selected);
      const nextDocument = uploaded.documents[0];
      setDocument(nextDocument);
      setStage('extracting');
      await invoiceImportApi.extract(nextDocument.id);
      const [draft, original] = await Promise.all([invoiceImportApi.getDraft(nextDocument.id), invoiceImportApi.original(nextDocument.id)]);
      setReview(draft);
      setPreviewUrl(URL.createObjectURL(original));
      setStage('review');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The document could not be processed.');
      setStage('error');
    }
  };

  const patch = async (input: InvoiceImportDraftPatch) => {
    if (!document) return;
    try {
      setReview(await invoiceImportApi.patchDraft(document.id, input));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'The review changes could not be saved.');
    }
  };

  const commit = async (acknowledgeDuplicates: boolean) => {
    if (!document) return;
    setCommitting(true);
    try {
      const result = await invoiceImportApi.commit(document.id, acknowledgeDuplicates);
      toast.success(result.recordType === 'invoice' ? 'Draft invoice created' : 'Draft bill created', { description: 'The original document is attached and locked.' });
      navigate(result.recordType === 'invoice' ? `/invoices/${result.recordId}` : `/bills/${result.recordId}/edit`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'The draft could not be created.');
    } finally {
      setCommitting(false);
    }
  };

  const download = () => {
    if (!previewUrl || !document) return;
    const anchor = window.document.createElement('a'); anchor.href = previewUrl; anchor.download = document.originalFilename; anchor.click();
  };

  const contacts = [
    ...(customers.data ?? []).map((contact) => ({ id: contact.id, name: contact.name, type: 'customer' as const })),
    ...(vendors.data ?? []).map((contact) => ({ id: contact.id, name: contact.name, type: 'vendor' as const })),
  ];

  return <div className="space-y-6">
    <PageHeader title="Import from file" description="Upload an invoice or bill, review the extraction, then create a draft. Nothing is sent, paid or posted." backTo={params.get('from') === 'bills' ? '/bills' : '/invoices'} />
    {stage === 'idle' && <ContentPanel><h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">Choose a document</h2><p className="mb-6 mt-2 text-sm text-muted-foreground">The document type is deliberately left unselected until review.</p><InvoiceImportDropzone onFile={(selected) => void begin(selected)} error={error} /></ContentPanel>}
    {(stage === 'uploading' || stage === 'extracting') && <ContentPanel><div className="mx-auto max-w-xl py-12 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#9FE870] text-[#163300]"><FileSearch className="animate-pulse" /></span><h2 ref={headingRef} tabIndex={-1} className="mt-5 text-2xl font-bold outline-none">Preparing your review</h2><p className="mt-2 text-muted-foreground">{stage === 'uploading' ? 'Uploading the original document…' : 'Extracting fields and checking totals…'}</p><ol className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-3 text-left text-sm"><li className="rounded-xl border border-border p-4"><Check className="mb-2 h-4 w-4 text-success" />Upload document</li><li className="rounded-xl border border-[#163300] bg-[#9FE870]/20 p-4"><span className="mb-2 block h-4 w-4 animate-spin rounded-full border-2 border-[#163300] border-t-transparent" />Extract and validate</li></ol><p className="mt-6 text-xs text-muted-foreground">You will choose Sales or Purchase on the next screen.</p></div></ContentPanel>}
    {stage === 'error' && <ContentPanel><div className="mx-auto max-w-lg py-10 text-center"><AlertTriangle className="mx-auto h-10 w-10 text-destructive" /><h2 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold outline-none">We couldn't process this file</h2><p className="mt-2 text-muted-foreground" role="alert">{error}</p><div className="mt-6 flex justify-center gap-3"><Button variant="outline" onClick={() => { setStage('idle'); setError(null); }}>Choose another</Button><Button className="bg-[#9FE870] text-[#163300] hover:bg-[#8ED85F]" disabled={!file} onClick={() => file && void begin(file)}><RotateCcw />Try again</Button></div></div></ContentPanel>}
    {stage === 'review' && review && document && <><h2 ref={headingRef} tabIndex={-1} className="sr-only">Review imported document</h2>{(customers.isError || vendors.isError) && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">Contacts could not be loaded. Try refreshing before committing.</div>}<InvoiceImportReview review={review} filename={document.originalFilename} mimeType={document.mimeType} previewUrl={previewUrl} organisationName={profile.data?.name ?? 'your business'} contacts={contacts} onChange={(input) => void patch(input)} onCommit={(ack) => void commit(ack)} onDownload={download} committing={committing} /></>}
  </div>;
}

export function InvoiceImportPage() {
  const { hasPermission } = usePermissions();
  return hasPermission('invoices:import') ? <ImportWorkspace /> : <ImportDenied />;
}

export default InvoiceImportPage;
