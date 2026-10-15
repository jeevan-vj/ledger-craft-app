import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Mail, Eye, Edit, ExternalLink, AlertTriangle, CheckCircle, Clock, Receipt as ReceiptIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Payment, EnhancedInvoice, Receipt } from '@/types/payment';
import { format } from 'date-fns';
import { BreadcrumbNavigation } from '@/components/common/BreadcrumbNavigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { paymentService } from '@/services/paymentService';
import { useAppData } from '@/hooks/useAppData';

export default function PaymentDetailPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getInvoice } = useAppData();
  
  const [payment, setPayment] = useState<Payment | null>(null);
  const [invoice, setInvoice] = useState<EnhancedInvoice | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPaymentDetails = async () => {
    if (!paymentId) {
      setError('Payment ID not provided');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch payment details
      const fetchedPayment = await paymentService.getPayment(paymentId);
      if (!fetchedPayment) {
        setError('Payment not found');
        return;
      }
      setPayment(fetchedPayment);

      // Fetch related invoice
      if (fetchedPayment.invoiceId) {
        try {
          const fetchedInvoice = await getInvoice(fetchedPayment.invoiceId);
          if (fetchedInvoice) {
            // Convert to EnhancedInvoice format
            const enhancedInvoice: EnhancedInvoice = {
              ...fetchedInvoice,
              paymentStatus: fetchedInvoice.paymentStatus || 'unpaid',
              totalPaid: fetchedInvoice.totalPaid || 0,
              balanceDue: fetchedInvoice.total - (fetchedInvoice.totalPaid || 0),
              taxInclusive: fetchedInvoice.taxInclusive || false,
              currency: fetchedInvoice.currency || '$'
            };
            setInvoice(enhancedInvoice);
          }
        } catch (invoiceError) {
          console.warn('Could not fetch related invoice:', invoiceError);
        }
      }

      // Fetch receipt for this payment
      try {
        const fetchedReceipt = await paymentService.getReceiptByPayment(paymentId);
        if (fetchedReceipt) {
          setReceipt(fetchedReceipt);
        }
      } catch (receiptError) {
        console.warn('Could not fetch receipt:', receiptError);
      }

    } catch (error) {
      console.error('Error fetching payment details:', error);
      setError(error instanceof Error ? error.message : 'Failed to load payment details');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentDetails();
  }, [paymentId]);

  const handleViewInvoice = () => {
    if (invoice) {
      navigate(`/invoices/${invoice.id}`);
    }
  };

  const handleViewReceipt = () => {
    if (receipt) {
      navigate(`/receipts/${receipt.id}`);
    }
  };

  const handleDownloadReceipt = async () => {
    if (!receipt) return;
    
    try {
      // TODO: Implement actual receipt download/PDF generation
      toast({
        title: "Download started",
        description: "Receipt download functionality will be implemented soon"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download receipt",
        variant: "destructive"
      });
    }
  };

  const handleResendReceipt = async () => {
    if (!receipt) return;
    
    try {
      await paymentService.markReceiptAsEmailed(receipt.id);
      
      setReceipt(prev => prev ? {
        ...prev,
        isEmailed: true,
        emailSentAt: new Date().toISOString()
      } : null);
      
      toast({
        title: "Success",
        description: "Receipt email sent successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send receipt email",
        variant: "destructive"
      });
    }
  };

  const getPaymentStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'failed':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPaymentMethodDisplay = (method: string) => {
    const methods: Record<string, string> = {
      'bank_transfer': 'Bank Transfer',
      'credit_card': 'Credit Card',
      'cash': 'Cash',
      'check': 'Check',
      'online_payment': 'Online Payment'
    };
    return methods[method] || method;
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
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        {/* Status Card Skeleton */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div>
                  <Skeleton className="h-6 w-32 mb-1" />
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
              <Skeleton className="h-8 w-24" />
            </div>
          </CardContent>
        </Card>

        {/* Details Grid Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
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
            onClick={() => navigate('/payments')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Payments
          </Button>
        </div>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {error}. Please check the payment ID and try again.
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Payment Not Found</h3>
              <p className="text-muted-foreground mb-4">
                The payment you're looking for doesn't exist or may have been deleted.
              </p>
              <Button onClick={() => navigate('/payments')}>
                View All Payments
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!payment) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <BreadcrumbNavigation />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <PageHeader
          title="Payment Details"
          description={`Payment ID: ${payment.id}`}
          backTo="/payments"
          className="mb-0"
        />
        
        <div className="flex items-center gap-3">
          {invoice && (
            <Button
              variant="outline"
              onClick={handleViewInvoice}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Invoice
            </Button>
          )}
          
          {receipt && (
            <Button
              variant="outline"
              onClick={handleViewReceipt}
            >
              <Eye className="mr-2 h-4 w-4" />
              View Receipt
            </Button>
          )}
        </div>
      </div>

      {/* Payment Status Overview */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gray-100 rounded-full">
                {getPaymentStatusIcon(payment.status)}
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  ${payment.amount.toFixed(2)} Payment
                </h3>
                <p className="text-muted-foreground">
                  {getPaymentMethodDisplay(payment.paymentMethod)} • 
                  {format(new Date(payment.paymentDate), ' dd MMM yyyy')}
                </p>
              </div>
            </div>
            {getPaymentStatusBadge(payment.status)}
          </div>
        </CardContent>
      </Card>

      {/* Payment Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Information */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment ID</span>
                <span className="font-mono">{payment.id}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">${payment.amount.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Method</span>
                <span>{getPaymentMethodDisplay(payment.paymentMethod)}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Date</span>
                <span>{format(new Date(payment.paymentDate), 'dd MMM yyyy')}</span>
              </div>
              
              {payment.referenceNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference Number</span>
                  <span className="font-mono">{payment.referenceNumber}</span>
                </div>
              )}
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                {getPaymentStatusBadge(payment.status)}
              </div>

              <Separator />
              
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span>{format(new Date(payment.createdAt), 'dd MMM yyyy HH:mm')}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{format(new Date(payment.updatedAt), 'dd MMM yyyy HH:mm')}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Related Invoice */}
        {invoice && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Related Invoice</span>
                <Button variant="ghost" size="sm" onClick={handleViewInvoice}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice Number</span>
                  <span className="font-mono">{invoice.invoiceNumber}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span>{invoice.customer?.name}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice Total</span>
                  <span className="font-semibold">${invoice.total.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Paid</span>
                  <span className="text-green-600 font-semibold">${invoice.totalPaid.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Balance Due</span>
                  <span className={`font-semibold ${invoice.balanceDue === 0 ? 'text-green-600' : 'text-orange-600'}`}>
                    ${invoice.balanceDue.toFixed(2)}
                  </span>
                </div>

                <Separator />
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Status</span>
                  <Badge variant={invoice.paymentStatus === 'paid' ? "default" : "secondary"}>
                    {invoice.paymentStatus}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Receipt Information */}
      {receipt && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptIcon className="h-5 w-5" />
              Receipt Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Receipt Number</label>
                <p className="font-mono">{receipt.receiptNumber}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">Generated</label>
                <p>{format(new Date(receipt.generatedAt), 'dd MMM yyyy HH:mm')}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email Status</label>
                <div className="flex items-center gap-2">
                  {receipt.isEmailed ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-green-600">Sent</span>
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4 text-yellow-600" />
                      <span className="text-yellow-600">Not Sent</span>
                    </>
                  )}
                </div>
                {receipt.emailSentAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(receipt.emailSentAt), 'dd MMM HH:mm')}
                  </p>
                )}
              </div>
              
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadReceipt}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
                
                {invoice?.customer?.email && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResendReceipt}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    {receipt.isEmailed ? 'Resend' : 'Send'} Email
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {payment.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{payment.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}