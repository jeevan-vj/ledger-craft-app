import React, { useState } from 'react';
import { format } from 'date-fns';
import { 
  Receipt, 
  Download, 
  Mail, 
  MoreHorizontal, 
  ArrowUpRight, 
  Filter,
  Search,
  Calendar,
  DollarSign,
  TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Payment, EnhancedInvoice } from '@/types/payment';

interface PaymentHistoryProps {
  payments: Payment[];
  invoices: EnhancedInvoice[];
  isLoading?: boolean;
  onViewReceipt: (paymentId: string) => void;
  onDownloadReceipt: (paymentId: string) => void;
  onResendReceipt: (paymentId: string) => void;
  onRefundPayment?: (paymentId: string) => void;
}

export function PaymentHistory({
  payments,
  invoices,
  isLoading = false,
  onViewReceipt,
  onDownloadReceipt,
  onResendReceipt,
  onRefundPayment
}: PaymentHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  // Calculate summary statistics
  const totalPayments = payments.filter(p => p.status === 'completed').length;
  const totalAmount = payments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const averagePayment = totalPayments > 0 ? totalAmount / totalPayments : 0;
  const pendingPayments = payments.filter(p => p.status === 'pending').length;

  // Filter payments
  const filteredPayments = payments.filter(payment => {
    const matchesSearch = payment.referenceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    const matchesMethod = methodFilter === 'all' || payment.paymentMethod === methodFilter;
    
    return matchesSearch && matchesStatus && matchesMethod;
  });

  const getPaymentMethodLabel = (method: string) => {
    const methodMap: Record<string, string> = {
      'bank_transfer': 'Bank Transfer',
      'cash': 'Cash',
      'cheque': 'Cheque',
      'credit_card': 'Credit Card',
      'online': 'Online Payment'
    };
    return methodMap[method] || method;
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'pending': return 'secondary';
      case 'failed': return 'destructive';
      case 'cancelled': return 'outline';
      case 'refunded': return 'secondary';
      default: return 'outline';
    }
  };

  const getInvoiceForPayment = (paymentId: string) => {
    const payment = payments.find(p => p.id === paymentId);
    return payment ? invoices.find(inv => inv.id === payment.invoiceId) : null;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-8 w-48 mb-4" />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        <div>
          <dt className="text-sm text-muted-foreground">Received</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">${totalAmount.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Payments</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{totalPayments}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Average</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">${averagePayment.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Pending</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{pendingPayments}</dd>
        </div>
      </dl>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Payment History</span>
            <Badge variant="outline">{filteredPayments.length} payments</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by reference number or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>

            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Payment Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="credit_card">Credit Card</SelectItem>
                <SelectItem value="online">Online Payment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Payment Table */}
          {filteredPayments.length === 0 ? (
            <Alert>
              <AlertDescription>
                {payments.length === 0 
                  ? "No payments recorded yet. Payments will appear here once they're added to invoices."
                  : "No payments match the current filters. Try adjusting your search criteria."
                }
              </AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => {
                    const invoice = getInvoiceForPayment(payment.id);
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">
                          {format(new Date(payment.paymentDate), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>#{invoice?.invoiceNumber || 'N/A'}</span>
                            {invoice && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => {/* Navigate to invoice */}}
                              >
                                <ArrowUpRight className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          ${payment.amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {getPaymentMethodLabel(payment.paymentMethod)}
                        </TableCell>
                        <TableCell>
                          {payment.referenceNumber || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(payment.status)}>
                            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onViewReceipt(payment.id)}>
                                <Receipt className="mr-2 h-4 w-4" />
                                View Receipt
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDownloadReceipt(payment.id)}>
                                <Download className="mr-2 h-4 w-4" />
                                Download Receipt
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onResendReceipt(payment.id)}>
                                <Mail className="mr-2 h-4 w-4" />
                                Resend Receipt
                              </DropdownMenuItem>
                              {onRefundPayment && payment.status === 'completed' && (
                                <DropdownMenuItem 
                                  onClick={() => onRefundPayment(payment.id)}
                                  className="text-red-600"
                                >
                                  Refund Payment
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}