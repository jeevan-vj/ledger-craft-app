import React from 'react';
import { useAppData } from '@/hooks/useAppData';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, getStatusColor, formatDate } from '@/utils/invoiceUtils';
import { Button } from '@/components/ui/button';
import { Plus, ChevronRight, Calendar, DollarSign, Edit, Trash2, Copy, Loader2, Share2, Filter, X, Search, ChevronDown, RefreshCw, Clock, Upload, Download } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ContentPanel } from '@/components/ui/ContentPanel';
import { useIsMobile } from '@/hooks/use-mobile';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { useState, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import ShareInvoiceModal from '@/components/invoice/ShareInvoiceModal';
import PaymentReminderModal from '@/components/invoice/PaymentReminderModal';
import { PaymentCaptureModal } from '@/components/invoice/PaymentCaptureModal';
import { Invoice, InvoiceStatus } from '@/types';
import { CreatePaymentRequest } from '@/types/payment';
import { paymentService } from '@/services/paymentService';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];

const AMOUNT_RANGES = [
  { value: '0-100', label: '$0 - $100', min: 0, max: 100 },
  { value: '100-500', label: '$100 - $500', min: 100, max: 500 },
  { value: '500-1000', label: '$500 - $1,000', min: 500, max: 1000 },
  { value: '1000-5000', label: '$1,000 - $5,000', min: 1000, max: 5000 },
  { value: '5000+', label: '$5,000+', min: 5000, max: Infinity },
];

const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'overdue', label: 'Overdue' },
];

interface InvoiceFilters {
  search: string;
  status: InvoiceStatus[];
  dateRange: string;
  amountRange: string;
  customer: string;
  sortBy: 'date' | 'dueDate' | 'amount' | 'customer' | 'status' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

const Invoices = () => {
  const { invoices, isLoadingInvoices, refreshInvoices, businessProfile, deleteInvoice, updateInvoiceStatus } = useAppData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusLoading, setStatusLoading] = useState<{ [id: string]: boolean }>({});
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [invoiceToShare, setInvoiceToShare] = useState<Invoice | null>(null);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [invoiceToRemind, setInvoiceToRemind] = useState<Invoice | null>(null);
  const [paymentCaptureOpen, setPaymentCaptureOpen] = useState(false);
  const [invoiceForPayment, setInvoiceForPayment] = useState<Invoice | null>(null);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filters, setFilters] = useState<InvoiceFilters>({
    search: '',
    status: [],
    dateRange: 'all',
    amountRange: 'all',
    customer: 'all',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const handleDeleteClick = (id: string) => {
    setInvoiceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete) return;
    setDeleting(true);
    try {
      await deleteInvoice(invoiceToDelete);
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
      // Force refresh from database after delete
      await refreshInvoices();
      toast({
        title: "Success",
        description: "Invoice deleted successfully.",
      });
    } catch (e) {
      // error toast will come from context
    } finally {
      setDeleting(false);
    }
  };

  const handleClone = async (invoice) => {
    try {
      const created = await invoicesApi.duplicate(invoice.id);
      toast({ title: 'Invoice cloned', description: 'A new invoice has been created.' });
      // Force refresh from database after clone
      await refreshInvoices();
      navigate(`/invoices/${created.id}/edit`);
    } catch (e) {
      toast({ title: 'Clone failed', description: 'Could not clone invoice.', variant: 'destructive' });
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    // If changing to "paid", open payment capture modal instead
    if (newStatus === 'paid') {
      const invoice = invoices.find(i => i.id === id);
      if (invoice) {
        setInvoiceForPayment(invoice);
        setPaymentCaptureOpen(true);
      }
      return;
    }

    setStatusLoading((prev) => ({ ...prev, [id]: true }));
    const prevInvoice = invoices.find(i => i.id === id);
    try {
      await updateInvoiceStatus(id, newStatus as any);
      toast({ title: 'Status updated', description: `Invoice status changed to ${newStatus}.` });
      // Force refresh from database after status update
      await refreshInvoices();
    } catch (e) {
      toast({ title: 'Update failed', description: 'Could not update invoice status.', variant: 'destructive' });
    } finally {
      setStatusLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleShareClick = (invoice: Invoice) => {
    setInvoiceToShare(invoice);
    setShareModalOpen(true);
  };

  const handleReminderClick = (invoice: Invoice) => {
    setInvoiceToRemind(invoice);
    setReminderModalOpen(true);
  };

  const handlePaymentRecord = async (paymentData: CreatePaymentRequest) => {
    setRecordingPayment(true);
    try {
      await paymentService.createPayment(paymentData);
      toast({ 
        title: 'Payment recorded', 
        description: 'Payment has been successfully recorded and receipt generated.' 
      });
      // Force refresh from database after payment recording
      await refreshInvoices();
      setPaymentCaptureOpen(false);
      setInvoiceForPayment(null);
    } catch (error) {
      console.error('Error recording payment:', error);
      toast({ 
        title: 'Payment failed', 
        description: 'Could not record payment. Please try again.', 
        variant: 'destructive' 
      });
    } finally {
      setRecordingPayment(false);
    }
  };

  // No useEffects needed - data manager handles initialization and updates automatically
  // Manual refresh is available via the refresh button

  // Manual refresh function
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshInvoices();
      toast({
        title: "Refreshed",
        description: "Invoice list has been updated.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh invoices. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const getDateRangeFilter = (range: string, invoiceDate: string, dueDate: string) => {
    const now = new Date();
    const invoiceDateObj = new Date(invoiceDate);
    const dueDateObj = new Date(dueDate);
    
    switch (range) {
      case 'today':
        return invoiceDateObj.toDateString() === now.toDateString();
      case 'week':
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        const weekEnd = new Date(now.setDate(now.getDate() - now.getDay() + 6));
        return invoiceDateObj >= weekStart && invoiceDateObj <= weekEnd;
      case 'month':
        return invoiceDateObj.getMonth() === now.getMonth() && invoiceDateObj.getFullYear() === now.getFullYear();
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        const invoiceQuarter = Math.floor(invoiceDateObj.getMonth() / 3);
        return quarter === invoiceQuarter && invoiceDateObj.getFullYear() === now.getFullYear();
      case 'year':
        return invoiceDateObj.getFullYear() === now.getFullYear();
      case 'overdue':
        return dueDateObj < now && ['sent', 'overdue'].includes(invoices.find(i => i.date === invoiceDate)?.status || '');
      default:
        return true;
    }
  };

  const filteredAndSortedInvoices = useMemo(() => {
    let filtered = invoices.filter((invoice) => {
      // Search filter
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        const matchesSearch = 
          invoice.invoiceNumber.toLowerCase().includes(searchTerm) ||
          invoice.customer?.name?.toLowerCase().includes(searchTerm) ||
          invoice.customerId.toLowerCase().includes(searchTerm) ||
          formatCurrency(invoice.total).toLowerCase().includes(searchTerm);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status.length > 0) {
        if (!filters.status.includes(invoice.status)) return false;
      }

      // Date range filter
      if (filters.dateRange && filters.dateRange !== 'all') {
        if (!getDateRangeFilter(filters.dateRange, invoice.date, invoice.dueDate)) return false;
      }

      // Amount range filter
      if (filters.amountRange && filters.amountRange !== 'all') {
        const range = AMOUNT_RANGES.find(r => r.value === filters.amountRange);
        if (range && (invoice.total < range.min || invoice.total > range.max)) return false;
      }

      // Customer filter
      if (filters.customer && filters.customer !== 'all') {
        const customerName = invoice.customer?.name || invoice.customerId;
        if (!customerName.toLowerCase().includes(filters.customer.toLowerCase())) return false;
      }

      return true;
    });

    // Sort filtered results
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (filters.sortBy) {
        case 'date':
          aValue = new Date(a.date);
          bValue = new Date(b.date);
          break;
        case 'dueDate':
          aValue = new Date(a.dueDate);
          bValue = new Date(b.dueDate);
          break;
        case 'amount':
          aValue = a.total;
          bValue = b.total;
          break;
        case 'customer':
          aValue = a.customer?.name || a.customerId;
          bValue = b.customer?.name || b.customerId;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
        default:
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
      }

      if (filters.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [invoices, filters]);

  const updateFilter = (key: keyof InvoiceFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      status: [],
      dateRange: 'all',
      amountRange: 'all',
      customer: 'all',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.search) count++;
    if (filters.status.length > 0) count++;
    if (filters.dateRange && filters.dateRange !== 'all') count++;
    if (filters.amountRange && filters.amountRange !== 'all') count++;
    if (filters.customer && filters.customer !== 'all') count++;
    return count;
  };

  const uniqueCustomers = useMemo(() => {
    const customers = invoices.map(i => i.customer?.name || i.customerId).filter(Boolean);
    return [...new Set(customers)].sort();
  }, [invoices]);

  if (isLoadingInvoices) {
    return <div className="flex justify-center items-center h-64">Loading invoices...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        actions={
          invoices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a href={invoicesApi.exportUrl} download><Download size={18} /><span>Export CSV</span></a>
              </Button>
              <Button asChild>
                <Link to="/invoices/new"><Plus size={18} /><span>New Invoice</span></Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      {invoices.length === 0 ? (
        <EmptyState
          variant="panel"
          title="Here's how to get started"
          description="Create a draft invoice, or import bank transactions to match later."
          actions={[
            {
              icon: Plus,
              title: 'Create invoice',
              subtitle: 'Add a customer, line items, and send when you are ready.',
              to: '/invoices/new',
              testId: 'empty-create-invoice',
            },
            {
              icon: Upload,
              title: 'Import transactions',
              subtitle: 'Upload a statement and we will help you reconcile payments.',
              to: '/transaction-import',
            },
          ]}
        />
      ) : (
      <>
      <div className="flex flex-col gap-4">

        {/* Search and Quick Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search invoices, customers..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center gap-2"
            >
              <Filter size={16} />
              Filters
              {getActiveFiltersCount() > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {getActiveFiltersCount()}
                </Badge>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
            </Button>
          </div>

          {/* Advanced Filters */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleContent className="space-y-4">
              <Card className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Status Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.map((status) => (
                        <Button
                          key={status.value}
                          variant={filters.status.includes(status.value as InvoiceStatus) ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const newStatus = filters.status.includes(status.value as InvoiceStatus)
                              ? filters.status.filter(s => s !== status.value)
                              : [...filters.status, status.value as InvoiceStatus];
                            updateFilter('status', newStatus);
                          }}
                          className="text-xs"
                        >
                          {status.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Date Range Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date Range</label>
                    <Select value={filters.dateRange} onValueChange={(value) => updateFilter('dateRange', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Time</SelectItem>
                        {DATE_RANGES.map((range) => (
                          <SelectItem key={range.value} value={range.value}>
                            {range.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Amount Range Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount Range</label>
                    <Select value={filters.amountRange} onValueChange={(value) => updateFilter('amountRange', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Amounts</SelectItem>
                        {AMOUNT_RANGES.map((range) => (
                          <SelectItem key={range.value} value={range.value}>
                            {range.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sort Options */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Sort By</label>
                    <div className="flex gap-2">
                      <Select value={filters.sortBy} onValueChange={(value) => updateFilter('sortBy', value)}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="createdAt">Created Date</SelectItem>
                          <SelectItem value="date">Invoice Date</SelectItem>
                          <SelectItem value="dueDate">Due Date</SelectItem>
                          <SelectItem value="amount">Amount</SelectItem>
                          <SelectItem value="customer">Customer</SelectItem>
                          <SelectItem value="status">Status</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                        className="px-3"
                      >
                        {filters.sortOrder === 'asc' ? '↑' : '↓'}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Customer Filter - Full Width */}
                <div className="mt-4 space-y-2">
                  <label className="text-sm font-medium">Customer</label>
                  <Select value={filters.customer} onValueChange={(value) => updateFilter('customer', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      {uniqueCustomers.map((customer) => (
                        <SelectItem key={customer} value={customer}>
                          {customer}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Clear Filters */}
                {getActiveFiltersCount() > 0 && (
                  <div className="mt-4 flex justify-end">
                    <Button variant="ghost" onClick={clearFilters} className="text-sm">
                      <X size={16} className="mr-2" />
                      Clear Filters
                    </Button>
                  </div>
                )}
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Results Summary */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {filteredAndSortedInvoices.length} of {invoices.length} invoices
              {getActiveFiltersCount() > 0 && (
                <span className="ml-2">
                  ({getActiveFiltersCount()} filter{getActiveFiltersCount() !== 1 ? 's' : ''} applied)
                </span>
              )}
              {isLoadingInvoices && (
                <span className="ml-2 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading...
                </span>
              )}
            </span>
            {filteredAndSortedInvoices.length > 0 && (
              <span>
                Total: {formatCurrency(filteredAndSortedInvoices.reduce((sum, inv) => sum + inv.total, 0))}
              </span>
            )}
          </div>
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete Invoice?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="w-full"
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
            <DialogClose asChild>
              <Button variant="secondary" className="w-full mt-2" disabled={deleting}>Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isMobile ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredAndSortedInvoices.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No invoices match your filters.</p>
          ) : (
            filteredAndSortedInvoices.map((invoice) => (
              <Card key={invoice.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle
                      className="text-lg cursor-pointer hover:underline"
                      onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
                    >
                      {invoice.invoiceNumber}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Select
                        value={invoice.status}
                        onValueChange={val => handleStatusChange(invoice.id, val)}
                        disabled={statusLoading[invoice.id]}
                      >
                        <SelectTrigger className={`px-2 py-1 text-xs rounded-full border min-w-[100px] ${getStatusColor(invoice.status)}`}> 
                          <SelectValue />
                          {statusLoading[invoice.id] && <Loader2 className="animate-spin w-4 h-4 text-muted-foreground ml-2" />}
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p
                    className="text-sm text-muted-foreground cursor-pointer hover:underline"
                    onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
                  >
                    {invoice.customer?.name || invoice.customerId}
                  </p>
                </CardHeader>
                <CardContent className="pt-2 pb-2">
                  <div className="space-y-1">
                    <div
                      className="flex items-center text-sm cursor-pointer hover:underline"
                      onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      <span className="font-medium mr-1">Due:</span> {invoice.dueDate}
                    </div>
                    <div
                      className="flex items-center text-sm cursor-pointer hover:underline"
                      onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
                    >
                      <DollarSign className="w-4 h-4 mr-2" />
                      <span className="font-medium mr-1">Amount:</span> {formatCurrency(invoice.total)}
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2 justify-end pt-2">
                  <Button variant="ghost" className="h-8 px-3 text-xs" asChild>
                    <Link to={`/invoices/${invoice.id}`} className="flex items-center">
                      View
                      <ChevronRight className="ml-1 w-4 h-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    asChild
                    aria-label="Edit invoice"
                  >
                    <Link to={`/invoices/${invoice.id}/edit`}>
                      <Edit size={16} />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    aria-label="Delete invoice"
                    onClick={() => handleDeleteClick(invoice.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Clone invoice"
                    onClick={() => handleClone(invoice)}
                  >
                    <Copy size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Share invoice"
                    onClick={() => handleShareClick(invoice)}
                  >
                    <Share2 size={16} />
                  </Button>
                  {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      aria-label="Send payment reminder"
                      onClick={() => handleReminderClick(invoice)}
                      title="Send Payment Reminder"
                    >
                      <Clock size={16} />
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      ) : (
        <ContentPanel padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      No invoices match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                      <TableCell>{invoice.customer?.name || invoice.customerId}</TableCell>
                      <TableCell>{invoice.date}</TableCell>
                      <TableCell>{invoice.dueDate}</TableCell>
                      <TableCell>{formatCurrency(invoice.total)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={invoice.status}
                            onValueChange={val => handleStatusChange(invoice.id, val)}
                            disabled={statusLoading[invoice.id]}
                          >
                            <SelectTrigger className={`px-2 py-1 text-xs rounded-full border min-w-[100px] ${getStatusColor(invoice.status)}`}>
                              <SelectValue />
                              {statusLoading[invoice.id] && <Loader2 className="animate-spin w-4 h-4 text-muted-foreground ml-2" />}
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          asChild
                          aria-label="Edit invoice"
                        >
                          <Link to={`/invoices/${invoice.id}/edit`}>
                            <Edit size={16} />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label="Delete invoice"
                          onClick={() => handleDeleteClick(invoice.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                        <Button variant="ghost" className="h-8 px-2" asChild>
                          <Link to={`/invoices/${invoice.id}`}>View</Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Clone invoice"
                          onClick={() => handleClone(invoice)}
                        >
                          <Copy size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Share invoice"
                          onClick={() => handleShareClick(invoice)}
                        >
                          <Share2 size={16} />
                        </Button>
                        {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            aria-label="Send payment reminder"
                            onClick={() => handleReminderClick(invoice)}
                            title="Send Payment Reminder"
                          >
                            <Clock size={16} />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </ContentPanel>
      )}
      </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this invoice? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Invoice Modal */}
      {invoiceToShare && (
        <ShareInvoiceModal
          open={shareModalOpen}
          onOpenChange={setShareModalOpen}
          invoice={invoiceToShare}
          businessName={businessProfile?.name}
        />
      )}

      {/* Payment Reminder Modal */}
      {invoiceToRemind && (
        <PaymentReminderModal
          open={reminderModalOpen}
          onOpenChange={setReminderModalOpen}
          invoice={invoiceToRemind}
        />
      )}

      {/* Payment Capture Modal */}
      {invoiceForPayment && (
        <PaymentCaptureModal
          open={paymentCaptureOpen}
          onOpenChange={setPaymentCaptureOpen}
          invoice={invoiceForPayment}
          onPaymentRecord={handlePaymentRecord}
          isLoading={recordingPayment}
        />
      )}
    </div>
  );
};

export default Invoices;
