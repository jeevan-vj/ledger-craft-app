import React, { useState } from 'react';
import { format } from 'date-fns';
import { 
  Download, 
  Mail, 
  Printer, 
  Share2, 
  Eye,
  FileText,
  CheckCircle,
  Building,
  User,
  Calendar,
  CreditCard,
  Receipt as ReceiptIcon,
  Copy,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import { Receipt, ReceiptData } from '@/types/payment';

interface ReceiptViewerProps {
  receipt: Receipt;
  onDownload: () => void;
  onPrint: () => void;
  isLoading?: boolean;
}

export function ReceiptViewer({
  receipt,
  onDownload,
  onPrint,
  isLoading = false
}: ReceiptViewerProps) {
  const [showFullReceipt, setShowFullReceipt] = useState(false);

  const { receiptData } = receipt;
  if (!receiptData) {
    return (
      <Alert>
        <AlertDescription>
          Receipt data is not available. Please contact support if this issue persists.
        </AlertDescription>
      </Alert>
    );
  }

  const { payment, invoice, customer, business } = receiptData;
  
  // Add safety checks for required data
  if (!payment || !invoice || !customer) {
    return (
      <Alert>
        <AlertDescription>
          Receipt data is incomplete. Missing payment, invoice, or customer information.
        </AlertDescription>
      </Alert>
    );
  }

  // Provide default business info if missing
  const businessInfo = business || {
    name: 'Business details unavailable',
    email: '',
    phone: '',
    address: '',
    website: ''
  };

  const handleCopyReceiptNumber = async () => {
    try {
      await navigator.clipboard.writeText(receipt.receiptNumber);
      toast({
        title: "Copied",
        description: "Receipt number copied to clipboard"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy receipt number",
        variant: "destructive"
      });
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Receipt ${receipt.receiptNumber}`,
          text: `Payment receipt for invoice ${invoice.invoiceNumber}`,
          url: window.location.href
        });
      } catch (error) {
        // User cancelled sharing
      }
    } else {
      toast({
        title: "Share not supported",
        description: "Web sharing is not supported on this browser",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Receipt Header */}
      <Card className="border-l-4 border-l-green-500">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <ReceiptIcon className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-xl">Payment Receipt</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-mono font-bold text-green-600">
                    {receipt.receiptNumber}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyReceiptNumber}
                    className="h-6 w-6 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {receipt.isEmailed && (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Emailed
                </Badge>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Share2 className="h-4 w-4" />
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onPrint}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print Receipt
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <Mail className="mr-2 h-4 w-4" />
                    Email unavailable
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShare}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Dialog open={showFullReceipt} onOpenChange={setShowFullReceipt}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Eye className="h-4 w-4" />
                    View Full Receipt
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Receipt {receipt.receiptNumber}</DialogTitle>
                  </DialogHeader>
                  <FullReceiptView receiptData={receiptData} />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Receipt Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Amount Paid</p>
                <p className="text-2xl font-bold text-green-600">
                  {invoice.currency || '$'}{(receiptData.amountPaid || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payment Date</p>
                <p className="font-medium">
                  {receiptData.paymentDate ? format(new Date(receiptData.paymentDate), 'dd MMM yyyy') : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payment Method</p>
                <p className="font-medium">{receiptData.paymentMethod || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Remaining Balance</p>
                <p className={`font-medium ${
                  (receiptData.balanceAfterPayment || 0) > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {invoice.currency || '$'}{(receiptData.balanceAfterPayment || 0).toFixed(2)}
                </p>
              </div>
            </div>

            {payment.referenceNumber && (
              <div>
                <p className="text-sm text-muted-foreground">Reference Number</p>
                <p className="font-mono text-sm bg-muted p-2 rounded">
                  {payment.referenceNumber}
                </p>
              </div>
            )}

            {payment.notes && (
              <div>
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm bg-muted p-2 rounded italic">
                  {payment.notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invoice & Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Invoice Number</span>
                <Badge variant="outline">#{invoice.invoiceNumber || 'N/A'}</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Invoice Total</span>
                <span className="font-medium">
                  {invoice.currency || '$'}{(invoice.total || 0).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Due Date</span>
                <span className="font-medium">
                  {invoice.dueDate ? format(new Date(invoice.dueDate), 'dd MMM yyyy') : 'N/A'}
                </span>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Customer</span>
              </div>
              <div className="pl-6 space-y-1">
                <p className="font-medium">{customer.name || 'Unknown Customer'}</p>
                <p className="text-sm text-muted-foreground">{customer.email || 'No email'}</p>
                {customer.address && (
                  <p className="text-sm text-muted-foreground">
                    {customer.address}
                    {customer.city && `, ${customer.city}`}
                    {customer.state && `, ${customer.state}`}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tax Breakdown */}
      {receiptData.taxBreakdown && (
        <Card>
          <CardHeader>
            <CardTitle>Tax Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{invoice.currency}{receiptData.taxBreakdown.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>
                  {receiptData.taxBreakdown.taxName} ({(receiptData.taxBreakdown.taxRate * 100).toFixed(1)}%)
                </span>
                <span>{invoice.currency}{receiptData.taxBreakdown.taxAmount.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>{invoice.currency}{receiptData.taxBreakdown.total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Receipt Metadata */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Generated</p>
              <p className="font-medium">
                {format(new Date(receipt.generatedAt), 'dd MMM yyyy HH:mm')}
              </p>
            </div>
            {receipt.emailSentAt && (
              <div>
                <p className="text-muted-foreground">Email Sent</p>
                <p className="font-medium">
                  {format(new Date(receipt.emailSentAt), 'dd MMM yyyy HH:mm')}
                </p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">Business</p>
              <p className="font-medium">{businessInfo.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <Badge variant="outline">Valid</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Full Receipt View Component
function FullReceiptView({ receiptData }: { receiptData: ReceiptData }) {
  const { payment, invoice, customer, business } = receiptData;

  // Additional safety checks for FullReceiptView
  if (!payment || !invoice || !customer) {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 shadow-lg rounded-lg text-center">
        <Alert>
          <AlertDescription>
            Unable to display full receipt. Some required data is missing.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Provide default business info if missing
  const businessInfo = business || {
    name: 'Business details unavailable',
    email: '',
    phone: '',
    address: '',
    website: ''
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 shadow-lg rounded-lg">
      {/* Receipt Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ReceiptIcon className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment Receipt</h1>
        <p className="text-lg text-gray-600">#{receiptData.receiptNumber || 'N/A'}</p>
      </div>

      {/* Business Information */}
      <div className="mb-8 p-6 bg-gray-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-3">From</h2>
        <div className="space-y-1">
          <p className="font-medium text-lg">{businessInfo.name}</p>
          {businessInfo.email && <p className="text-gray-600">{businessInfo.email}</p>}
          {businessInfo.phone && <p className="text-gray-600">{businessInfo.phone}</p>}
          {businessInfo.address && <p className="text-gray-600">{businessInfo.address}</p>}
        </div>
      </div>

      {/* Customer Information */}
      <div className="mb-8 p-6 bg-blue-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-3">To</h2>
        <div className="space-y-1">
          <p className="font-medium text-lg">{customer.name || 'Unknown Customer'}</p>
          {customer.email && <p className="text-gray-600">{customer.email}</p>}
          {customer.address && (
            <p className="text-gray-600">
              {customer.address}
              {customer.city && `, ${customer.city}`}
              {customer.state && `, ${customer.state}`}
            </p>
          )}
        </div>
      </div>

      {/* Payment Details */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Payment Details</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-gray-500 mb-1">Invoice Number</p>
            <p className="font-medium">#{invoice.invoiceNumber || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Payment Date</p>
            <p className="font-medium">
              {receiptData.paymentDate ? format(new Date(receiptData.paymentDate), 'dd MMM yyyy') : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Payment Method</p>
            <p className="font-medium">{receiptData.paymentMethod || 'Unknown'}</p>
          </div>
          {payment.referenceNumber && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Reference</p>
              <p className="font-medium">{payment.referenceNumber}</p>
            </div>
          )}
        </div>
      </div>

      {/* Amount Paid */}
      <div className="mb-8 p-6 bg-green-50 rounded-lg text-center">
        <p className="text-sm text-gray-500 mb-2">Amount Paid</p>
        <p className="text-4xl font-bold text-green-600">
          {invoice.currency || '$'}{(receiptData.amountPaid || 0).toFixed(2)}
        </p>
      </div>

      {/* Tax Breakdown */}
      {receiptData.taxBreakdown && (
        <div className="mb-8 p-6 bg-gray-50 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">Tax Breakdown</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{invoice.currency || '$'}{(receiptData.taxBreakdown.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>
                {receiptData.taxBreakdown.taxName || 'Tax'} ({((receiptData.taxBreakdown.taxRate || 0) * 100).toFixed(1)}%):
              </span>
              <span>{invoice.currency || '$'}{(receiptData.taxBreakdown.taxAmount || 0).toFixed(2)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Total:</span>
              <span>{invoice.currency || '$'}{(receiptData.taxBreakdown.total || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Balance Information */}
      <div className="mb-8 p-6 bg-gray-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">Balance Information</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">Original Total</p>
            <p className="font-medium">{invoice.currency || '$'}{(invoice.total || 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Total Paid</p>
            <p className="font-medium text-green-600">{invoice.currency || '$'}{(invoice.totalPaid || 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Remaining</p>
            <p className={`font-medium ${
              (receiptData.balanceAfterPayment || 0) > 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              {invoice.currency || '$'}{(receiptData.balanceAfterPayment || 0).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 border-t pt-6">
        <p className="mb-2">Thank you for your payment!</p>
        <p>This receipt was generated on {format(new Date(), 'dd MMM yyyy')} at {format(new Date(), 'HH:mm')}</p>
        {businessInfo.website && <p>Visit us at {businessInfo.website}</p>}
      </div>
    </div>
  );
}
