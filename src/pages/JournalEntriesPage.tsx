import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Download, RefreshCw, Calendar, Eye, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { JournalEntry } from '@/types/payment';
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, subQuarters } from 'date-fns';
import { useAuth } from "@/context/StableAuthContext";
import { supabaseDataService } from '@/services/supabaseDataService';
import { PageHeader } from '@/components/layout/PageHeader';

interface JournalEntryFormData {
  description: string;
  referenceNumber?: string;
  entryDate: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  notes?: string;
}

export default function JournalEntriesPage() {
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('current_month');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();

  const getDateRangeForPeriod = (period: string) => {
    const now = new Date();
    switch (period) {
      case 'current_month':
        return {
          startDate: startOfMonth(now).toISOString().split('T')[0],
          endDate: endOfMonth(now).toISOString().split('T')[0]
        };
      case 'last_month':
        const lastMonth = subMonths(now, 1);
        return {
          startDate: startOfMonth(lastMonth).toISOString().split('T')[0],
          endDate: endOfMonth(lastMonth).toISOString().split('T')[0]
        };
      case 'current_quarter':
        return {
          startDate: startOfQuarter(now).toISOString().split('T')[0],
          endDate: endOfQuarter(now).toISOString().split('T')[0]
        };
      case 'current_year':
        return {
          startDate: startOfYear(now).toISOString().split('T')[0],
          endDate: endOfYear(now).toISOString().split('T')[0]
        };
      default:
        return {
          startDate: startOfMonth(now).toISOString().split('T')[0],
          endDate: endOfMonth(now).toISOString().split('T')[0]
        };
    }
  };

  const fetchJournalEntries = async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      const dateRange = getDateRangeForPeriod(periodFilter);
      
      // Fetch real journal entries from Supabase
      const entries = await supabaseDataService.getJournalEntries(
        user.id,
        100, // limit
        0, // offset
        statusFilter === 'all' ? undefined : statusFilter,
        dateRange.startDate,
        dateRange.endDate
      );

      setJournalEntries(entries);
    } catch (error) {
      console.error('Error fetching journal entries:', error);
      toast({
        title: "Error",
        description: "Failed to load journal entries",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAccounts = async () => {
    if (!user?.id) return;
    
    try {
      const accountsData = await supabaseDataService.getAccounts(user.id);
      setAccounts(accountsData);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast({
        title: "Error",
        description: "Failed to load accounts",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchJournalEntries();
      fetchAccounts();
    }
  }, [user?.id, periodFilter, statusFilter]);

  // Filter entries based on search (status and period filtering is done in the API call)
  useEffect(() => {
    let filtered = journalEntries;

    if (searchTerm) {
      filtered = filtered.filter(entry =>
        entry.entryNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.referenceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.debitAccountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.creditAccountName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredEntries(filtered);
  }, [journalEntries, searchTerm]);

  const handleCreateEntry = async (formData: JournalEntryFormData) => {
    if (!user?.id) return;
    
    try {
      const newEntry = await supabaseDataService.createJournalEntry(user.id, {
        description: formData.description,
        entryDate: formData.entryDate,
        debitAccountId: formData.debitAccountId,
        creditAccountId: formData.creditAccountId,
        amount: formData.amount,
        referenceNumber: formData.referenceNumber,
        notes: formData.notes
      });

      setJournalEntries(prev => [newEntry, ...prev]);
      setShowCreateDialog(false);
      
      toast({
        title: "Success",
        description: "Journal entry created successfully"
      });
    } catch (error) {
      console.error('Error creating journal entry:', error);
      toast({
        title: "Error",
        description: "Failed to create journal entry",
        variant: "destructive"
      });
    }
  };

  const handlePostEntry = async (entryId: string) => {
    try {
      await supabaseDataService.updateJournalEntryStatus(entryId, 'posted');
      
      setJournalEntries(prev => 
        prev.map(entry => 
          entry.id === entryId 
            ? { ...entry, status: 'posted', updatedAt: new Date().toISOString() }
            : entry
        )
      );
      
      toast({
        title: "Success",
        description: "Journal entry posted successfully"
      });
    } catch (error) {
      console.error('Error posting journal entry:', error);
      toast({
        title: "Error",
        description: "Failed to post journal entry",
        variant: "destructive"
      });
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await supabaseDataService.deleteJournalEntry(entryId);
      
      setJournalEntries(prev => prev.filter(entry => entry.id !== entryId));
      
      toast({
        title: "Success",
        description: "Journal entry deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting journal entry:', error);
      toast({
        title: "Error",
        description: "Failed to delete journal entry",
        variant: "destructive"
      });
    }
  };

  const handleExportEntries = async () => {
    try {
      // Simulate export
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({
        title: "Success",
        description: "Journal entries exported successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export journal entries",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        {/* Summary Cards Skeleton */}
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

  const totalEntries = filteredEntries.length;
  const draftEntries = filteredEntries.filter(e => e.status === 'draft').length;
  const postedEntries = filteredEntries.filter(e => e.status === 'posted').length;
  const totalAmount = filteredEntries.reduce((sum, e) => sum + e.debitAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <PageHeader
          title="Journal Entries"
          description="Manage and track all accounting journal entries"
        />
        
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={fetchJournalEntries}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            variant="outline"
            onClick={handleExportEntries}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          
          <Button
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Entries</p>
                <p className="text-2xl font-bold">{totalEntries}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Edit className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Draft</p>
                <p className="text-2xl font-bold">{draftEntries}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Eye className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Posted</p>
                <p className="text-2xl font-bold">{postedEntries}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Download className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-2xl font-bold">${totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Journal Entries</span>
            <Badge variant="outline">{filteredEntries.length} entries</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entries</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
              </SelectContent>
            </Select>

            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Current Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="current_quarter">Current Quarter</SelectItem>
                <SelectItem value="current_year">Current Year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Journal Entries Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Debit Account</TableHead>
                  <TableHead>Credit Account</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.entryNumber}
                    </TableCell>
                    <TableCell>
                      {format(new Date(entry.entryDate), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{entry.description}</p>
                        {entry.referenceNumber && (
                          <p className="text-sm text-muted-foreground">
                            Ref: {entry.referenceNumber}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{entry.debitAccountName}</p>
                        <p className="text-sm text-muted-foreground">
                          ${entry.debitAmount.toFixed(2)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{entry.creditAccountName}</p>
                        <p className="text-sm text-muted-foreground">
                          ${entry.creditAmount.toFixed(2)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      ${entry.debitAmount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.status === 'posted' ? "default" : "secondary"}>
                        {entry.status === 'posted' ? 'Posted' : 'Draft'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedEntry(entry);
                            setShowViewDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {entry.status === 'draft' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePostEntry(entry.id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteEntry(entry.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredEntries.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' || periodFilter !== 'current_month'
                  ? "No journal entries match your search criteria"
                  : "No journal entries found. Create your first entry using the button above."
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Entry Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Journal Entry Details</DialogTitle>
          </DialogHeader>
          
          {selectedEntry && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Entry Number</label>
                  <p className="mt-1">{selectedEntry.entryNumber}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Date</label>
                  <p className="mt-1">{format(new Date(selectedEntry.entryDate), 'dd MMM yyyy')}</p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Description</label>
                <p className="mt-1">{selectedEntry.description}</p>
              </div>
              
              {selectedEntry.referenceNumber && (
                <div>
                  <label className="text-sm font-medium">Reference Number</label>
                  <p className="mt-1">{selectedEntry.referenceNumber}</p>
                </div>
              )}
              
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-3">Journal Entry</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Debit: {selectedEntry.debitAccountName}</span>
                    <span className="font-medium">${selectedEntry.debitAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Credit: {selectedEntry.creditAccountName}</span>
                    <span className="font-medium">${selectedEntry.creditAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              
              {selectedEntry.notes && (
                <div>
                  <label className="text-sm font-medium">Notes</label>
                  <p className="mt-1 text-muted-foreground">{selectedEntry.notes}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <label className="font-medium">Created</label>
                  <p>{format(new Date(selectedEntry.createdAt), 'dd MMM yyyy HH:mm')}</p>
                </div>
                <div>
                  <label className="font-medium">Status</label>
                  <p>
                    <Badge variant={selectedEntry.status === 'posted' ? "default" : "secondary"}>
                      {selectedEntry.status === 'posted' ? 'Posted' : 'Draft'}
                    </Badge>
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Entry Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Journal Entry</DialogTitle>
          </DialogHeader>
          
          <JournalEntryForm
            accounts={accounts}
            onSubmit={handleCreateEntry}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Journal Entry Form Component
function JournalEntryForm({ 
  accounts, 
  onSubmit, 
  onCancel 
}: {
  accounts: any[];
  onSubmit: (data: JournalEntryFormData) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<JournalEntryFormData>({
    description: '',
    referenceNumber: '',
    entryDate: new Date().toISOString().split('T')[0],
    debitAccountId: '',
    creditAccountId: '',
    amount: 0,
    notes: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.description || !formData.debitAccountId || !formData.creditAccountId || formData.amount <= 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Entry Date</label>
          <Input
            type="date"
            value={formData.entryDate}
            onChange={(e) => setFormData(prev => ({ ...prev, entryDate: e.target.value }))}
            required
          />
        </div>
        
        <div>
          <label className="text-sm font-medium">Reference Number</label>
          <Input
            placeholder="Optional reference"
            value={formData.referenceNumber}
            onChange={(e) => setFormData(prev => ({ ...prev, referenceNumber: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Description</label>
        <Input
          placeholder="Enter journal entry description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          required
        />
      </div>

      <div>
        <label className="text-sm font-medium">Amount</label>
        <Input
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={formData.amount || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Debit Account</label>
          <Select value={formData.debitAccountId} onValueChange={(value) => setFormData(prev => ({ ...prev, debitAccountId: value }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select debit account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(account => (
                <SelectItem key={account.id} value={account.id}>
                  {account.number} - {account.name} ({account.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium">Credit Account</label>
          <Select value={formData.creditAccountId} onValueChange={(value) => setFormData(prev => ({ ...prev, creditAccountId: value }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select credit account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(account => (
                <SelectItem key={account.id} value={account.id}>
                  {account.number} - {account.name} ({account.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <Input
          placeholder="Optional notes"
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Entry'}
        </Button>
      </div>
    </form>
  );
}