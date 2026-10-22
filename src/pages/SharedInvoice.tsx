import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, AlertCircle, Loader2, Smartphone } from 'lucide-react';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';
import { Invoice, BusinessProfile } from '@/types';
import { applyNoReferrerPolicy } from '@/lib/referrerPolicy';
import { generateInvoicePdf } from '@/utils/pdfUtils';
import { useToast } from '@/hooks/use-toast';

import { createTemplateData, renderTemplateComponent } from '@/services/invoiceTemplateRenderer';
import type { InvoiceTemplateId } from '@/components/invoice/templates/InvoiceTemplates';
import type { InvoiceAttachmentDto } from '@ledgercraft/contracts';

const SharedInvoice: React.FC = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoiceData, setInvoiceData] = useState<Invoice | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [templateName, setTemplateName] = useState<string>('classic');
  const [isDownloading, setIsDownloading] = useState(false);
  const [attachments, setAttachments] = useState<InvoiceAttachmentDto[]>([]);
  const templateRef = useRef<HTMLDivElement>(null);
  const selectedTemplate = templateName.toLowerCase() as InvoiceTemplateId;
  const appUrl = shareToken
    ? `easybizinvoice://shared/invoice/${encodeURIComponent(shareToken)}`
    : 'easybizinvoice://';
  const installUrl = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
    ? 'https://play.google.com/store/apps/details?id=com.easybizinvoice.app'
    : 'https://apps.apple.com/app/id6818787287';

  useLayoutEffect(() => applyNoReferrerPolicy(), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInvoiceData(null);
    const fetchSharedInvoice = async () => {
      if (!shareToken) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        const result = await invoicesApi.getShared(shareToken);
        if (cancelled) return;
        
        if (!result) {
          setError('Invoice not found or link has expired');
          setLoading(false);
          return;
        }

        
        setInvoiceData(result.invoiceData);
        setBusinessProfile(result.templateData.businessProfile);
        setTemplateName(result.templateData.templateName || 'classic');
        setAttachments(result.templateData.attachments ?? []);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching shared invoice:', err);
        setError('Failed to load invoice');
        setLoading(false);
      }
    };

    fetchSharedInvoice();
    return () => { cancelled = true; };
  }, [shareToken]);

  const handleDownloadPdf = async () => {
    if (!invoiceData || !businessProfile || !templateRef.current || isDownloading) return;

    setIsDownloading(true);
    try {
      await generateInvoicePdf(invoiceData, templateRef.current, selectedTemplate, businessProfile.logoUrl);
      toast({
        title: 'PDF downloaded',
        description: 'Invoice PDF has been downloaded successfully.',
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'Download failed',
        description: 'Failed to generate PDF. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const renderTemplate = () => {
    if (!invoiceData || !businessProfile) return null;

    return renderTemplateComponent(selectedTemplate, createTemplateData(invoiceData, businessProfile));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 bg-destructive/10 rounded-full p-3 w-fit">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-xl text-card-foreground">Invoice Not Found</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-foreground">{error}</p>
            <p className="text-sm text-muted-foreground">
              This link may have expired or been deactivated. Please request a new link from the sender.
            </p>
            <Button 
              onClick={() => navigate('/')} 
              className="w-full"
            >
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="bg-card border-b border-border sm:sticky sm:top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="bg-accent rounded-lg p-2 shrink-0">
                <FileText className="h-5 w-5 text-accent-foreground" />
              </div>
              <div className="min-w-0 break-words">
                <h1 className="text-lg font-semibold text-card-foreground">
                  Invoice {invoiceData?.invoiceNumber}
                </h1>
                <p className="text-sm text-muted-foreground">
                  From {businessProfile?.name || 'Business'}
                </p>
              </div>
            </div>
            
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Button variant="outline" asChild className="min-h-11">
                <a href={appUrl} aria-label="Open in LedgerCraft">
                  <Smartphone className="h-4 w-4" />
                  Open in LedgerCraft
                </a>
              </Button>
              <Button variant="ghost" asChild className="min-h-11">
                <a href={installUrl} target="_blank" rel="noopener noreferrer" aria-label="Get the app">
                  Get the app
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={isDownloading}
                className="flex min-h-11 w-full sm:w-auto items-center justify-center gap-2"
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>{isDownloading ? 'Generating...' : 'Download PDF'}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div ref={templateRef} className="p-2 sm:p-6 md:p-8">
            {renderTemplate()}
          </div>
        </div>

        {attachments.length > 0 ? (
          <Card className="mt-4 p-4">
            <h2 className="font-semibold">Shared attachments</h2>
            <ul className="mt-2 space-y-2">
              {attachments.map((file) => (
                <li key={file.id}>
                  <a className="text-sm font-medium text-primary underline" href={`/api/public/invoices/${encodeURIComponent(shareToken ?? '')}/attachments/${file.id}`} target="_blank" rel="noreferrer">{file.filename}</a>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            This invoice was shared securely. 
            {businessProfile?.name && (
              <> View more from {businessProfile.name}.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SharedInvoice;
