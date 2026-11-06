import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import InvoicePreview from '@/components/invoice/preview/InvoicePreview';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { publicInvoiceService } from '@/services/supabaseService';
import { settlementLabel } from '@/features/accounting-completion/settlementLabel';
import { applyNoReferrerPolicy } from '@/lib/referrerPolicy';
import type { InvoiceTemplateId } from '@/components/invoice/templates/InvoiceTemplates';
import { Invoice, BusinessProfile } from '@/types';
import { Download, Printer, ArrowLeft } from 'lucide-react';
import { generateInvoicePdf } from '@/utils/pdfUtils';
import { useToast } from '@/hooks/use-toast';

const PublicInvoice = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const { toast } = useToast();
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyNoReferrerPolicy();
    const fetchInvoice = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!invoiceId) {
          setError('Invoice ID is required');
          setLoading(false);
          return;
        }

        const result = await publicInvoiceService.getPublicInvoice(invoiceId);
        if (!result || !result.invoice) {
          setError('Invoice not found');
          setLoading(false);
          return;
        }
        setInvoice(result.invoice);
        setBusinessProfile(result.businessProfile);
      } catch (e) {
        setError('Error loading invoice');
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [invoiceId]);

  const handleDownloadPdf = async () => {
    if (!invoice || !invoiceRef.current) return;

    setIsGeneratingPdf(true);
    try {
      await generateInvoicePdf(invoice, invoiceRef.current, 'classic');
      toast({ title: 'PDF Downloaded', description: 'Invoice PDF has been downloaded successfully.' });
    } catch (error) {
      toast({ title: 'Download Failed', description: 'Could not download PDF. Please try again.', variant: 'destructive' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">{error}</p>
          <p className="text-sm">Please check the link and try again.</p>
        </div>
      </Card>
    );
  }

  if (!invoice) {
    return (
      <Card className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">Invoice not found</p>
          <p className="text-sm">The requested invoice could not be found.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Action buttons */}
      <div className="flex justify-between items-center mb-6 print:hidden">
        <Button variant="ghost" onClick={() => window.history.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
          >
            <Download className="mr-2 h-4 w-4" />
            {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {settlementLabel(invoice) && <p aria-label={`Payment status: ${settlementLabel(invoice)}`} className="mb-4 inline-flex rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">{settlementLabel(invoice)}</p>}
      {/* Invoice preview */}
      <div ref={invoiceRef} className="bg-white rounded-lg shadow-sm border">
        <InvoicePreview
          invoice={invoice}
          selectedTemplate={(invoice.templateName as InvoiceTemplateId) || "classic"}
          businessProfile={businessProfile}
        />
      </div>
    </div>
  );
};

export default PublicInvoice;
