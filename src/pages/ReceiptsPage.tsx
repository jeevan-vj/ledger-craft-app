import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Download, Mail, Search, Filter, Calendar, FileText } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAppData } from '@/hooks/useAppData';
import { Skeleton } from '@/components/ui/skeleton';
import { Receipt } from '@/types/payment';
import { format } from 'date-fns';

export default function ReceiptsPage() {
  const [filteredReceipts, setFilteredReceipts] = useState<Receipt[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const {
    receipts,
    isLoadingReceipts,
    refreshReceipts,
    markReceiptAsEmailed
  } = useAppData();

  // No need for fetchReceipts as we're using AppContext

  // Filter receipts based on search and status
  useEffect(() => {
    let filtered = receipts;

    if (searchTerm) {
      filtered = filtered.filter(receipt =>
        receipt.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        receipt.receiptData?.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        receipt.receiptData?.invoice?.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(receipt => {
        if (statusFilter === 'emailed') return receipt.isEmailed;
        if (statusFilter === 'not_emailed') return !receipt.isEmailed;
        return true;
      });
    }

    setFilteredReceipts(filtered);
  }, [receipts, searchTerm, statusFilter]);

  const handleViewReceipt = (receiptId: string) => {
    navigate(`/receipts/${receiptId}`);
  };

  const handleDownloadReceipt = async (receiptId: string) => {
    try {
      // Simulate download
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({
        title: "Success",
        description: "Receipt downloaded successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download receipt",
        variant: "destructive"
      });
    }
  };

  const handleResendEmail = async (receiptId: string) => {
    try {
      await markReceiptAsEmailed(receiptId);
      // The AppContext will handle updating the state and showing toast
    } catch (error) {
      console.error('Error resending receipt email:', error);
    }
  };

  if (isLoadingReceipts) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>

        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table Skeleton */}
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalReceipts = receipts.length;
  const emailedReceipts = receipts.filter(r => r.isEmailed).length;
  const totalAmount = receipts.reduce((sum, r) => sum + (r.receiptData?.amountPaid || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Receipts" />

      {receipts.length === 0 && (
        <EmptyState
          variant="hero"
          title="Receipts land here"
          description="When you record a payment, a receipt is generated automatically."
          benefits={[
            {
              icon: FileText,
              title: 'Generated from payments',
              subtitle: 'Each recorded payment creates a receipt you can send.',
            },
            {
              icon: Mail,
              title: 'Email to the customer',
              subtitle: 'Resend any time from the receipt list.',
            },
          ]}
          ctaLabel="Go to payments"
          ctaTo="/payments"
        />
      )}

      {receipts.length > 0 && (
      <>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        <div>
          <dt className="text-sm text-muted-foreground">Total receipts</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{totalReceipts}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Emailed</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{emailedReceipts}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Total amount</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">${totalAmount.toLocaleString()}</dd>
        </div>
      </dl>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Receipts</span>
            <Badge variant="outline">{filteredReceipts.length} receipts</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search receipts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Email Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Receipts</SelectItem>
                <SelectItem value="emailed">Emailed</SelectItem>
                <SelectItem value="not_emailed">Not Emailed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Receipts Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Email Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReceipts.map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell className="font-medium">
                      {receipt.receiptNumber}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{receipt.receiptData?.customer?.name || 'Unknown Customer'}</p>
                        <p className="text-sm text-muted-foreground">
                          {receipt.receiptData?.customer?.email || 'No email'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      #{receipt.receiptData?.invoice?.invoiceNumber || 'N/A'}
                    </TableCell>
                    <TableCell className="font-medium">
                      ${receipt.receiptData?.amountPaid?.toFixed(2) || '0.00'}
                    </TableCell>
                    <TableCell>
                      {format(new Date(receipt.generatedAt), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={receipt.isEmailed ? "default" : "secondary"}>
                          {receipt.isEmailed ? "Sent" : "Not Sent"}
                        </Badge>
                        {receipt.emailSentAt && (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(receipt.emailSentAt), 'dd MMM HH:mm')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewReceipt(receipt.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadReceipt(receipt.id)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResendEmail(receipt.id)}
                          disabled={!receipt.receiptData?.customer?.email}
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredReceipts.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' 
                  ? "No receipts match your search criteria"
                  : "No receipts found. Receipts will appear here after payments are processed."
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}