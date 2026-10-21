import React, { useRef, useState } from 'react';
import { Invoice, BusinessProfile, DEFAULT_BUSINESS_THEME } from '@/types';
import { InvoiceTemplateId } from '../templates/InvoiceTemplates';
import ClassicTemplate from './templates/ClassicTemplate';
import ModernTemplate from './templates/ModernTemplate';
import MinimalTemplate from './templates/MinimalTemplate';
import ExecutiveTemplate from './templates/ExecutiveTemplate';
import CorporateTemplate from './templates/CorporateTemplate';
import ModernInvoiceTemplate from './templates/ModernInvoiceTemplate';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Download, Maximize2, Minimize2, ZoomIn, ZoomOut, Printer, ArrowLeft, Save } from 'lucide-react';
import { generateInvoicePdf } from '@/utils/pdfUtils';
import { invoiceDisplayTaxRate } from '@/utils/invoiceUtils';
import { resolveDocumentLabels, type DocumentLabels } from './documentLabels';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAppData } from '@/hooks/useAppData';

interface InvoicePreviewProps {
  invoice: Invoice;
  selectedTemplate: InvoiceTemplateId;
  onBackToEdit?: () => void;
  businessProfile?: BusinessProfile | null;
  onSave?: () => Promise<void>;
  saveButtonText?: string;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  documentLabels?: DocumentLabels;
}

const InvoicePreview = ({ 
  invoice, 
  selectedTemplate, 
  onBackToEdit, 
  businessProfile,
  onSave,
  saveButtonText = "Save Invoice",
  isSaving = false,
  hasUnsavedChanges = false,
  documentLabels,
}: InvoicePreviewProps) => {
  const labels = resolveDocumentLabels(documentLabels);
  const contentRef = useRef<HTMLDivElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(isMobile ? 0.75 : 1); // Better mobile default for clear preview with borders
  const contextBusinessProfile = useAppData().businessProfile;
  const effectiveBusinessProfile = businessProfile !== undefined ? businessProfile : contextBusinessProfile;

  // Create template data from invoice
  const templateData = {
    invoice,
    companyName: effectiveBusinessProfile?.name || 'Business Name',
    companyAddress: [
      effectiveBusinessProfile?.address,
      effectiveBusinessProfile?.city,
      effectiveBusinessProfile?.state,
      effectiveBusinessProfile?.zip,
      effectiveBusinessProfile?.country
    ].filter(Boolean).join(', ') || '',
    companyPhone: effectiveBusinessProfile?.phone || '',
    bankAccountName: effectiveBusinessProfile?.bankAccountName,
    bankAccountNumber: effectiveBusinessProfile?.bankAccountNumber,
    clientName: invoice.customer?.name || 'Client Name',
    clientAddress: [
      invoice.customer?.address,
      invoice.customer?.city,
      invoice.customer?.state,
      invoice.customer?.zip,
      invoice.customer?.country
    ].filter(Boolean).join(', ') || '',
    taxRate: invoiceDisplayTaxRate(invoice),
    tax: invoice.taxAmount,
    businessLogo: effectiveBusinessProfile?.logoUrl || '',
    theme: effectiveBusinessProfile?.theme || DEFAULT_BUSINESS_THEME,
    labels,
  };

  const handleDownloadPdf = async () => {
    if (contentRef.current && templateRef.current && !isGeneratingPdf) {
      try {
        setIsGeneratingPdf(true);
        toast({
          title: "Processing",
          description: "Generating PDF, please wait...",
        });

        console.log("Starting PDF generation with template:", selectedTemplate);
        
        // Use the specific template ref for PDF generation
        // This ensures we're capturing just the template content, not the UI controls
        await generateInvoicePdf(
          invoice, 
          templateRef.current, 
          selectedTemplate, 
          effectiveBusinessProfile?.logoUrl,
          labels.title === 'INVOICE'
            ? undefined
            : { fileName: `Quote-${invoice.invoiceNumber}.pdf`, subject: labels.title },
        );
        
        toast({
          title: "Success",
          description: labels.title === 'INVOICE' ? "Invoice PDF has been downloaded" : "PDF downloaded",
        });
      } catch (error) {
        console.error('Error generating PDF:', error);
        toast({
          title: "Error",
          description: "Could not generate PDF. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsGeneratingPdf(false);
      }
    }
  };

  // Function to handle direct printing
  const handlePrint = () => {
    try {
      setIsPrinting(true);
      
      // Add a temporary print-only class to body during printing
      document.body.classList.add('printing-invoice');
      
      // Small delay to ensure the print-specific styles are applied
      setTimeout(() => {
        // Use the browser's print functionality
        window.print();
        
        // Remove the class after printing dialog is closed
        setTimeout(() => {
          document.body.classList.remove('printing-invoice');
          setIsPrinting(false);
        }, 500);
      }, 100);
    } catch (error) {
      console.error('Print error:', error);
      document.body.classList.remove('printing-invoice');
      setIsPrinting(false);
      
      toast({
        title: "Error",
        description: "Could not print invoice. Please try again.",
        variant: "destructive"
      });
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const zoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.1, 1.5));
  };

  const zoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.1, 0.6));
  };

  const resetZoom = () => {
    setZoomLevel(isMobile ? 0.75 : 1);
  };

  const renderTemplate = () => {
    switch (selectedTemplate) {
      case 'classic':
        return <ClassicTemplate {...templateData} />;
      case 'modern':
        return <ModernTemplate {...templateData} />;
      case 'minimal':
        return <MinimalTemplate {...templateData} />;
      case 'executive':
        return <ExecutiveTemplate {...templateData} />;
      case 'corporate':
        return <CorporateTemplate {...templateData} />;
      case 'modernpro':
        return <ModernInvoiceTemplate {...templateData} />;
      default:
        return <ClassicTemplate {...templateData} />;
    }
  };

  return (
    <div 
      className={cn(
        "invoice-preview-container w-full bg-white text-black shadow-sm rounded-lg transition-all duration-300", 
        isMobile && (isFullscreen 
          ? "fixed inset-0 z-50 pt-16 overflow-auto" 
          : "mx-auto max-w-full relative")
      )}
    >
      <div 
        ref={contentRef}
        className={cn(
          "flex justify-center overflow-auto",
          isMobile ? "invoice-mobile-view p-4" : "p-6"
        )}
        style={{ 
          height: isFullscreen ? 'calc(100vh - 180px)' : isMobile ? 'auto' : 'auto',
          paddingBottom: isMobile ? '180px' : '0'
        }}
      >
        <div 
          className={cn(
            "invoice-content bg-white print:p-0 print:shadow-none w-full",
            isMobile ? "mobile-invoice-scale border rounded-lg shadow-md mx-2" : "border rounded-lg shadow-sm"
          )}
          style={{ 
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease',
            maxWidth: isMobile ? '100%' : '794px', // A4 width at 96 DPI
            margin: isMobile ? '16px auto' : '0 auto'
          }}
        >
          <div ref={templateRef} className="pdf-template-container print-template-wrapper mb-5">
            {renderTemplate()}
          </div>
        </div>
      </div>
      
      {/* Fixed bottom controls on mobile */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-50 pb-safe-xl">
          <div className="px-4 pt-4 pb-2">
            <div className="flex gap-2 mb-3">
              <Button 
                variant="outline" 
                size="default"
                onClick={zoomOut} 
                className="flex-1 h-11 text-sm"
                aria-label="Zoom out"
                disabled={zoomLevel <= 0.6 || isPrinting || isSaving}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="default"
                onClick={toggleFullscreen} 
                className="flex-1 h-11 text-sm"
                aria-label={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
                disabled={isPrinting || isSaving}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button 
                variant="outline"
                size="default"
                onClick={handlePrint}
                className="flex-1 h-11 text-sm"
                aria-label="Print invoice"
                disabled={isPrinting || isSaving}
              >
                <Printer className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="default"
                onClick={zoomIn} 
                className="flex-1 h-11 text-sm"
                aria-label="Zoom in"
                disabled={zoomLevel >= 1.5 || isPrinting || isSaving}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-1">
              <Button 
                variant="outline" 
                size="default"
                onClick={onBackToEdit} 
                className="flex-1 h-12 text-sm font-medium"
                aria-label="Back to edit"
                disabled={isPrinting || isGeneratingPdf || isSaving}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {/* <span>Back to Edit</span> */}
              </Button>
              
              {onSave && (
                <Button 
                  size="default"
                  onClick={onSave} 
                  className={cn(
                    "flex-1 h-12 text-sm font-medium",
                    hasUnsavedChanges && "ring-2 ring-orange-200 bg-orange-500 hover:bg-orange-600"
                  )}
                  disabled={isSaving || isPrinting || isGeneratingPdf}
                  aria-label={isSaving ? "Saving invoice" : saveButtonText}
                >
                  <Save className="h-4 w-4 mr-2" />
                  <span>{isSaving ? "Saving..." : saveButtonText}</span>
                </Button>
              )}
             
              <Button 
                variant="outline"
                size="default"
                onClick={handleDownloadPdf} 
                className="flex-1 h-12 text-sm font-medium"
                disabled={isGeneratingPdf || isPrinting || isSaving}
              >
                <Download className="h-4 w-4 mr-2" />
                <span>{isGeneratingPdf ? "Generating..." : "Download PDF"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop controls */}
      {!isMobile && (
        <div className="flex justify-center gap-3 mt-4 mb-10">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="flex items-center mb-5"
            aria-label="Print invoice"
            disabled={isPrinting || isSaving}
          >
            <Printer className="h-4 w-4 mr-2" />
            <span>{isPrinting ? "Printing..." : "Print"}</span>
          </Button>
          
          {onSave && (
            <Button
              size="sm"
              onClick={onSave}
              className={cn(
                "flex items-center mb-5",
                hasUnsavedChanges && "ring-2 ring-orange-200 bg-orange-500 hover:bg-orange-600"
              )}
              disabled={isSaving || isPrinting || isGeneratingPdf}
              aria-label={isSaving ? "Saving invoice" : saveButtonText}
            >
              <Save className="h-4 w-4 mr-2" />
              <span>{isSaving ? "Saving..." : saveButtonText}</span>
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            className="flex items-center mb-5"
            disabled={isGeneratingPdf || isPrinting || isSaving}
          >
            <Download className="h-4 w-4 mr-2" />
            <span>{isGeneratingPdf ? "Generating..." : "Download PDF"}</span>
          </Button>
        </div>
      )}
    </div>
  );
};

export default InvoicePreview;
