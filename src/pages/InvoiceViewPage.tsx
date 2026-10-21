import React from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAppData } from '@/hooks/useAppData';
import InvoicePreview from '@/components/invoice/preview/InvoicePreview';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

const InvoiceViewPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { invoices, isLoadingInvoices } = useAppData();

  const invoice = invoices.find((inv) => inv.id === id);

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
      <Button variant="ghost" className="mb-4" onClick={() => navigate(-1)}>
        <ChevronLeft className="mr-2 w-4 h-4" /> Back to Invoices
      </Button>
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