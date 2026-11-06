import { settlementLabel } from '@/features/accounting-completion/settlementLabel';
import React, { useState } from 'react';
import { format } from 'date-fns';
import { 
  Plus, 
  Receipt, 
  CreditCard, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  DollarSign,
  Calendar,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { EnhancedInvoice, Payment } from '@/types/payment';
import { PaymentForm } from '../payment/PaymentForm';

interface InvoicePaymentStatusProps {
  invoice: EnhancedInvoice;
  payments: Payment[];
  onAddPayment: () => void;
  onViewPayment: (paymentId: string) => void;
  isLoading?: boolean;
}

export function InvoicePaymentStatus({
  invoice,
  payments,
  onAddPayment,
  onViewPayment,
  isLoading = false
}: InvoicePaymentStatusProps) {
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  // Calculate payment progress
  const paymentProgress = invoice.total > 0 ? (invoice.totalPaid / invoice.total) * 100 : 0;
  
  // Get status configuration
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'paid':
        return {
          icon: CheckCircle,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          badgeVariant: 'default' as const,
          label: settlementLabel(invoice) ?? 'Paid'
        };
      case 'partially_paid':
        return {
          icon: Clock,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          badgeVariant: 'secondary' as const,
          label: 'Partially Paid'
        };
      case 'overdue':
        return {
          icon: AlertCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          badgeVariant: 'destructive' as const,
          label: 'Overdue'
        };
      case 'cancelled':
        return {
          icon: AlertCircle,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          badgeVariant: 'outline' as const,
          label: 'Cancelled'
        };
      default: // unpaid
        return {
          icon: Clock,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          badgeVariant: 'secondary' as const,
          label: 'Awaiting Payment'
        };
    }
  };

  const statusConfig = getStatusConfig(invoice.paymentStatus);
  const StatusIcon = statusConfig.icon;

  const completedPayments = payments.filter(p => p.status === 'completed');
  const pendingPayments = payments.filter(p => p.status === 'pending');

  return (
    <Card className={`${statusConfig.borderColor} border-l-4`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${statusConfig.bgColor}`}>
              <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Payment Status</h3>
              <Badge variant={statusConfig.badgeVariant} className="mt-1">
                {statusConfig.label}
              </Badge>
            </div>
          </CardTitle>
          
          {invoice.paymentStatus !== 'paid' && invoice.paymentStatus !== 'cancelled' && (
            <Dialog open={showPaymentForm} onOpenChange={setShowPaymentForm}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Payment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <PaymentForm
                  invoice={invoice}
                  onSubmit={async (data) => {
                    // Handle payment submission
                    setShowPaymentForm(false);
                    onAddPayment();
                  }}
                  onCancel={() => setShowPaymentForm(false)}
                  isLoading={isLoading}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Payment Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Total Amount
            </div>
            <p className="text-2xl font-bold">
              {invoice.currency}{invoice.total.toFixed(2)}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4" />
              Amount Paid
            </div>
            <p className="text-2xl font-bold text-green-600">
              {invoice.currency}{invoice.totalPaid.toFixed(2)}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Balance Due
            </div>
            <p className={`text-2xl font-bold ${
              invoice.balanceDue > 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              {invoice.currency}{invoice.balanceDue.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Payment Progress */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Payment Progress</span>
            <span className="text-sm text-muted-foreground">
              {paymentProgress.toFixed(0)}% Complete
            </span>
          </div>
          <Progress value={paymentProgress} className="h-3" />
        </div>

        {/* Overdue Alert */}
        {invoice.paymentStatus === 'overdue' && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              This invoice is overdue. Due date was {format(new Date(invoice.dueDate), 'dd MMM yyyy')}.
              Consider sending a payment reminder to the customer.
            </AlertDescription>
          </Alert>
        )}

        {/* Pending Payments Alert */}
        {pendingPayments.length > 0 && (
          <Alert className="border-yellow-200 bg-yellow-50">
            <Clock className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              {pendingPayments.length} payment{pendingPayments.length > 1 ? 's' : ''} pending confirmation.
              Total pending: {invoice.currency}{pendingPayments.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
            </AlertDescription>
          </Alert>
        )}

        <Separator />

        {/* Payment History */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Payment History</h4>
            {payments.length > 0 && (
              <Badge variant="outline">{payments.length} payment{payments.length > 1 ? 's' : ''}</Badge>
            )}
          </div>

          {payments.length === 0 ? (
            <Alert>
              <AlertDescription>
                No payments recorded for this invoice yet.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {payments
                .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
                .map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <CreditCard className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {invoice.currency}{payment.amount.toFixed(2)}
                          </p>
                          <Badge 
                            variant={payment.status === 'completed' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {payment.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(payment.paymentDate), 'dd MMM yyyy')}
                          </div>
                          <span>
                            {payment.paymentMethod.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                          {payment.referenceNumber && (
                            <span>Ref: {payment.referenceNumber}</span>
                          )}
                        </div>
                        {payment.notes && (
                          <p className="text-xs text-muted-foreground italic">
                            {payment.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewPayment(payment.id)}
                        className="gap-1"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                      >
                        <Receipt className="h-3 w-3" />
                        Receipt
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {invoice.paymentStatus !== 'paid' && invoice.paymentStatus !== 'cancelled' && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="font-semibold">Quick Actions</h4>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPaymentForm(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Record Payment
                </Button>
                {invoice.paymentStatus === 'overdue' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <AlertCircle className="h-4 w-4" />
                    Send Reminder
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}