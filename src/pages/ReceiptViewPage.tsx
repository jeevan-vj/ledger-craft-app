import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Mail, Printer, Share2, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ReceiptViewer } from '@/components/receipt/ReceiptViewer';
import { Receipt } from '@/types/payment';
import { format } from 'date-fns';
import { BreadcrumbNavigation } from '@/components/common/BreadcrumbNavigation';
import { paymentService } from '@/services/paymentService';
import { downloadReceiptPdf } from '@/features/receipts/receiptPdf';

export default function ReceiptViewPage() {
  const { id: receiptId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReceipt = async () => {
    if (!receiptId) {
      setError('Receipt ID not provided');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch receipt from service
      const fetchedReceipt = await paymentService.getReceipt(receiptId);
      
      if (!fetchedReceipt) {
        setError('Receipt not found');
        return;
      }

      setReceipt(fetchedReceipt);
    } catch (error) {
      console.error('Error fetching receipt:', error);
      setError(error instanceof Error ? error.message : 'Failed to load receipt');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipt();
  }, [receiptId]);

  const handleDownload = async () => {
    try {
      if (!receipt) throw new Error('Receipt not found');
      downloadReceiptPdf(receipt);
      toast({
        title: "Receipt downloaded",
        description: `${receipt.receiptNumber}.pdf was created.`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download receipt",
        variant: "destructive"
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Receipt ${receipt?.receiptNumber}`,
          text: `Payment receipt for ${receipt?.receiptData?.customer.name}`,
          url: window.location.href
        });
      } else {
        // Fallback - copy to clipboard
        await navigator.clipboard.writeText(window.location.href);
        toast({
          title: "Success",
          description: "Receipt link copied to clipboard"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to share receipt",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="w-10 h-10 rounded-md" />
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        {/* Receipt Card Skeleton */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-20" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Business Info Skeleton */}
              <div className="text-center border-b pb-6">
                <Skeleton className="h-8 w-48 mx-auto mb-2" />
                <Skeleton className="h-4 w-64 mx-auto mb-1" />
                <Skeleton className="h-4 w-48 mx-auto" />
              </div>

              {/* Receipt Details Skeleton */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>

              {/* Payment Summary Skeleton */}
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {/* Breadcrumb Navigation */}
        <BreadcrumbNavigation />
        
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/receipts')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Receipts
          </Button>
        </div>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error}. Please check the receipt ID and try again.
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Receipt Not Found</h3>
              <p className="text-muted-foreground mb-4">
                The receipt you're looking for doesn't exist or may have been deleted.
              </p>
              <Button onClick={() => navigate('/receipts')}>
                View All Receipts
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!receipt) {
    return null;
  }

  const getEmailStatusIcon = () => {
    if (receipt.isEmailed) {
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    }
    return <Clock className="h-4 w-4 text-yellow-600" />;
  };

  const getEmailStatusText = () => {
    if (receipt.isEmailed && receipt.emailSentAt) {
      return `Sent ${format(new Date(receipt.emailSentAt), 'dd MMM yyyy HH:mm')}`;
    }
    return 'Delivery unavailable';
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <BreadcrumbNavigation />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/receipts')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Receipt {receipt.receiptNumber}</h1>
            <p className="text-muted-foreground">
              Payment receipt for {receipt.receiptData?.customer.name}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleDownload}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          
          <Button
            variant="outline"
            onClick={handlePrint}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          
          <Button
            variant="outline"
            onClick={handleShare}
          >
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
          
          {receipt.receiptData?.customer.email && (
            <Button
              disabled
              aria-label="Email delivery unavailable"
              title="Email delivery is unavailable on the current deployment"
            >
              <Mail className="mr-2 h-4 w-4" />
              Email unavailable
            </Button>
          )}
        </div>
      </div>

      {/* Email Status Alert */}
      <Alert>
        <div className="flex items-center gap-2">
          {getEmailStatusIcon()}
          <AlertDescription>
            Email status: {getEmailStatusText()}
            {receipt.isEmailed && receipt.receiptData?.customer.email && (
              <span className="ml-2">to {receipt.receiptData.customer.email}</span>
            )}
          </AlertDescription>
        </div>
      </Alert>

      {/* Receipt Details Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Receipt Details</CardTitle>
            <Badge variant={receipt.receiptData?.payment.status === 'completed' ? "default" : "secondary"}>
              {receipt.receiptData?.payment.status === 'completed' ? 'Paid' : 'Pending'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Receipt Number</label>
                <p className="font-mono">{receipt.receiptNumber}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Payment Date</label>
                <p>{format(new Date(receipt.receiptData?.paymentDate || receipt.generatedAt), 'dd MMMM yyyy')}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Payment Method</label>
                <p>{receipt.receiptData?.paymentMethod}</p>
              </div>
              {receipt.receiptData?.payment.referenceNumber && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Reference Number</label>
                  <p className="font-mono">{receipt.receiptData.payment.referenceNumber}</p>
                </div>
              )}
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Invoice Number</label>
                <p className="font-mono">{receipt.receiptData?.invoice.invoiceNumber}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Customer</label>
                <p>{receipt.receiptData?.customer.name}</p>
                <p className="text-sm text-muted-foreground">{receipt.receiptData?.customer.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Amount Paid</label>
                <p className="text-lg font-semibold">${receipt.receiptData?.amountPaid.toFixed(2)}</p>
              </div>
              {receipt.receiptData?.balanceAfterPayment !== undefined && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Remaining Balance</label>
                  <p className={`font-medium ${receipt.receiptData.balanceAfterPayment === 0 ? 'text-green-600' : 'text-orange-600'}`}>
                    ${receipt.receiptData.balanceAfterPayment.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Generated timestamps */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <label className="font-medium">Generated</label>
                <p>{format(new Date(receipt.generatedAt), 'dd MMM yyyy HH:mm')}</p>
              </div>
              {receipt.emailSentAt && (
                <div>
                  <label className="font-medium">Email Sent</label>
                  <p>{format(new Date(receipt.emailSentAt), 'dd MMM yyyy HH:mm')}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Receipt Viewer Component */}
      <div className="print:block print:break-before-page">
        <ReceiptViewer
          receipt={receipt}
          onDownload={handleDownload}
          onPrint={handlePrint}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
