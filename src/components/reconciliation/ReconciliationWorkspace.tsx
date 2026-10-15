/**
 * Reconciliation Workspace
 * 
 * Main workspace for bank reconciliation with:
 * - Side-by-side bank vs book transactions view
 * - Auto-matching functionality
 * - Manual matching interface
 * - Adjustments panel
 * - Summary and completion
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Wand2,
  Link2,
  Unlink,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  ArrowRightLeft,
  FileText,
  Receipt,
  CreditCard,
  Filter,
  Search,
  Download,
  Plus,
  CheckCheck,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

import { reconciliationService } from '@/services/reconciliationService';
import { ReconciliationSession, SuggestedMatch, MatchableItem, ReconciliationSummary } from '@/types/reconciliation';
import { BankTransaction } from '@/types/bankTransaction';

import { AdjustmentDialog } from './AdjustmentDialog';
import { ReconciliationReport } from './ReconciliationReport';

interface ReconciliationWorkspaceProps {
  session: ReconciliationSession;
  bankAccountId: string;
  onClose: () => void;
  onSessionUpdate: (session: ReconciliationSession) => void;
}

export function ReconciliationWorkspace({
  session,
  bankAccountId,
  onClose,
  onSessionUpdate,
}: ReconciliationWorkspaceProps) {
  // State
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [bookEntries, setBookEntries] = useState<MatchableItem[]>([]);
  const [suggestedMatches, setSuggestedMatches] = useState<SuggestedMatch[]>([]);
  const [selectedBankTx, setSelectedBankTx] = useState<string | null>(null);
  const [selectedBookEntry, setSelectedBookEntry] = useState<string | null>(null);
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set());
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [autoMatchLoading, setAutoMatchLoading] = useState(false);
  const [confirmMatchesLoading, setConfirmMatchesLoading] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showReconciled, setShowReconciled] = useState(false);
  const [activeTab, setActiveTab] = useState('match');
  
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [transactions, entries, summaryData] = await Promise.all([
        reconciliationService.getBankTransactions(
          bankAccountId,
          session.statementStartDate,
          session.statementEndDate,
          { showReconciled }
        ),
        reconciliationService.getBookEntries(
          session.statementStartDate,
          session.statementEndDate
        ),
        reconciliationService.generateSummary(session.id),
      ]);
      
      setBankTransactions(transactions);
      setBookEntries(entries);
      setSummary(summaryData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load reconciliation data');
    } finally {
      setLoading(false);
    }
  }, [bankAccountId, session, showReconciled]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-match
  const handleAutoMatch = async () => {
    setAutoMatchLoading(true);
    try {
      const matches = await reconciliationService.autoMatch(session.id);
      setSuggestedMatches(matches);
      setSelectedMatches(new Set(matches.map((_, i) => i)));
      toast.success(`Found ${matches.length} potential matches`);
    } catch (error) {
      console.error('Error auto-matching:', error);
      toast.error('Failed to auto-match transactions');
    } finally {
      setAutoMatchLoading(false);
    }
  };

  // Confirm selected matches
  const handleConfirmMatches = async () => {
    if (selectedMatches.size === 0) {
      toast.error('Please select at least one match to confirm');
      return;
    }

    setConfirmMatchesLoading(true);
    try {
      const matchesToConfirm = Array.from(selectedMatches).map(i => suggestedMatches[i]);
      await reconciliationService.confirmMatches(session.id, matchesToConfirm);
      
      // Remove confirmed matches from suggestions
      setSuggestedMatches(prev => prev.filter((_, i) => !selectedMatches.has(i)));
      setSelectedMatches(new Set());
      
      // Reload data
      await loadData();
      toast.success(`Confirmed ${matchesToConfirm.length} matches`);
    } catch (error) {
      console.error('Error confirming matches:', error);
      toast.error('Failed to confirm matches');
    } finally {
      setConfirmMatchesLoading(false);
    }
  };

  // Manual match
  const handleManualMatch = async () => {
    if (!selectedBankTx || !selectedBookEntry) {
      toast.error('Please select both a bank transaction and a book entry');
      return;
    }

    try {
      const bookEntry = bookEntries.find(e => e.id === selectedBookEntry);
      if (!bookEntry) return;

      await reconciliationService.createMatch(
        session.id,
        selectedBankTx,
        bookEntry.type as 'invoice' | 'payment' | 'expense',
        selectedBookEntry
      );

      setSelectedBankTx(null);
      setSelectedBookEntry(null);
      await loadData();
      toast.success('Match created successfully');
    } catch (error) {
      console.error('Error creating match:', error);
      toast.error('Failed to create match');
    }
  };

  // Complete reconciliation
  const handleComplete = async () => {
    try {
      const updatedSession = await reconciliationService.completeReconciliation(session.id);
      onSessionUpdate(updatedSession);
      setCompleteDialogOpen(false);
      toast.success('Reconciliation completed successfully!');
    } catch (error) {
      console.error('Error completing reconciliation:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to complete reconciliation');
    }
  };

  // Format helpers
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NZ', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Filter transactions
  const filteredBankTx = bankTransactions.filter(tx => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return tx.description.toLowerCase().includes(search) ||
             tx.reference?.toLowerCase().includes(search) ||
             tx.amount.toString().includes(search);
    }
    return true;
  });

  const filteredBookEntries = bookEntries.filter(entry => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return entry.description.toLowerCase().includes(search) ||
             entry.reference?.toLowerCase().includes(search) ||
             entry.amount.toString().includes(search);
    }
    return true;
  });

  // Calculate progress
  const totalItems = bankTransactions.length;
  const reconciledItems = bankTransactions.filter(tx => tx.isReconciled).length;
  const progress = totalItems > 0 ? (reconciledItems / totalItems) * 100 : 0;

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onClose}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">Bank Reconciliation</h1>
                <p className="text-sm text-muted-foreground">
                  {formatDate(session.statementStartDate)} - {formatDate(session.statementEndDate)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Progress */}
              <div className="flex items-center gap-3 px-4">
                <Progress value={progress} className="w-32 h-2" />
                <span className="text-sm text-muted-foreground">
                  {reconciledItems}/{totalItems} reconciled
                </span>
              </div>

              {/* Status badge */}
              {session.status === 'completed' ? (
                <Badge className="bg-emerald-100 text-emerald-700 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-700 gap-1">
                  <Clock className="h-3 w-3" />
                  In Progress
                </Badge>
              )}

              {/* Actions */}
              {session.status !== 'completed' && (
                <Button
                  onClick={() => setCompleteDialogOpen(true)}
                  disabled={!summary?.isReconciled}
                  className="gap-2"
                >
                  <CheckCheck className="h-4 w-4" />
                  Complete Reconciliation
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="container mx-auto px-6 py-4">
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Statement Balance</div>
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(session.statementClosingBalance)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Book Balance</div>
              <div className="text-2xl font-bold">
                {formatCurrency(summary?.bookBalance || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Adjusted Bank</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(summary?.adjustedBankBalance || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Difference</div>
              <div className={`text-2xl font-bold ${
                summary?.isReconciled ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatCurrency(summary?.finalDifference || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="match" className="gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Match Transactions
            </TabsTrigger>
            <TabsTrigger value="adjustments" className="gap-2">
              <Plus className="h-4 w-4" />
              Adjustments ({summary?.outstandingDeposits.length || 0 + (summary?.outstandingChecks.length || 0)})
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-2">
              <FileText className="h-4 w-4" />
              Summary Report
            </TabsTrigger>
          </TabsList>

          {/* Match Transactions Tab */}
          <TabsContent value="match" className="space-y-4">
            {/* Toolbar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Button onClick={handleAutoMatch} disabled={autoMatchLoading} className="gap-2">
                      {autoMatchLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                      Auto-Match
                    </Button>
                    
                    {suggestedMatches.length > 0 && (
                      <Button
                        onClick={handleConfirmMatches}
                        disabled={selectedMatches.size === 0 || confirmMatchesLoading}
                        variant="outline"
                        className="gap-2"
                      >
                        {confirmMatchesLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Confirm Selected ({selectedMatches.size})
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search transactions..."
                        className="pl-9 w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <Button
                      variant={showReconciled ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setShowReconciled(!showReconciled)}
                      className="gap-2"
                    >
                      <Filter className="h-4 w-4" />
                      {showReconciled ? 'Hide' : 'Show'} Reconciled
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Suggested Matches */}
            {suggestedMatches.length > 0 && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-blue-600" />
                    Suggested Matches ({suggestedMatches.length})
                  </CardTitle>
                  <CardDescription>
                    Review and confirm the auto-matched transactions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {suggestedMatches.map((match, index) => (
                        <div
                          key={index}
                          className={`p-3 rounded-lg border transition-colors ${
                            selectedMatches.has(index)
                              ? 'bg-blue-100 border-blue-300'
                              : 'bg-white border-gray-200 hover:border-blue-200'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <Checkbox
                              checked={selectedMatches.has(index)}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedMatches);
                                if (checked) {
                                  newSelected.add(index);
                                } else {
                                  newSelected.delete(index);
                                }
                                setSelectedMatches(newSelected);
                              }}
                            />
                            
                            {/* Bank Transaction */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <CreditCard className="h-4 w-4 text-slate-500" />
                                <span className="font-medium truncate">
                                  {match.bankTransaction.description}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {formatDate(match.bankTransaction.date)} • {formatCurrency(match.bankTransaction.amount)}
                              </div>
                            </div>

                            {/* Arrow */}
                            <div className="flex flex-col items-center px-4">
                              <Link2 className="h-4 w-4 text-blue-500" />
                              <Badge variant="outline" className="text-xs mt-1">
                                {match.confidenceScore}%
                              </Badge>
                            </div>

                            {/* Book Entry */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {match.bookItem.type === 'invoice' ? (
                                  <FileText className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Receipt className="h-4 w-4 text-red-500" />
                                )}
                                <span className="font-medium truncate">
                                  {match.bookItem.description}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {formatDate(match.bookItem.date)} • {formatCurrency(match.bookItem.amount)}
                              </div>
                            </div>
                          </div>

                          {/* Match reasons */}
                          <div className="mt-2 flex items-center gap-2 pl-8">
                            {match.matchReasons.map((reason, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Side-by-side view */}
            <div className="grid grid-cols-2 gap-4">
              {/* Bank Transactions */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Bank Transactions ({filteredBankTx.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {filteredBankTx.map(tx => (
                        <div
                          key={tx.id}
                          onClick={() => !tx.isReconciled && setSelectedBankTx(
                            selectedBankTx === tx.id ? null : tx.id
                          )}
                          className={`p-3 rounded-lg border transition-colors ${
                            tx.isReconciled
                              ? 'bg-green-50 border-green-200 opacity-75'
                              : selectedBankTx === tx.id
                              ? 'bg-blue-50 border-blue-300 cursor-pointer'
                              : 'bg-white border-gray-200 hover:border-gray-300 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate text-sm">
                                  {tx.description}
                                </span>
                                {tx.isReconciled && (
                                  <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {formatDate(tx.transactionDate)}
                                {tx.reference && ` • Ref: ${tx.reference}`}
                              </div>
                            </div>
                            <div className={`font-semibold text-sm ${
                              tx.type === 'credit' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredBankTx.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          No transactions found
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Book Entries */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Book Entries ({filteredBookEntries.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {filteredBookEntries.map(entry => (
                        <div
                          key={entry.id}
                          onClick={() => !entry.isReconciled && setSelectedBookEntry(
                            selectedBookEntry === entry.id ? null : entry.id
                          )}
                          className={`p-3 rounded-lg border transition-colors ${
                            entry.isReconciled
                              ? 'bg-green-50 border-green-200 opacity-75'
                              : selectedBookEntry === entry.id
                              ? 'bg-blue-50 border-blue-300 cursor-pointer'
                              : 'bg-white border-gray-200 hover:border-gray-300 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {entry.type === 'invoice' ? (
                                  <FileText className="h-3 w-3 text-green-500 flex-shrink-0" />
                                ) : entry.type === 'expense' ? (
                                  <Receipt className="h-3 w-3 text-red-500 flex-shrink-0" />
                                ) : (
                                  <DollarSign className="h-3 w-3 text-blue-500 flex-shrink-0" />
                                )}
                                <span className="font-medium truncate text-sm">
                                  {entry.description}
                                </span>
                                {entry.isReconciled && (
                                  <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {formatDate(entry.date)}
                                {entry.reference && ` • Ref: ${entry.reference}`}
                              </div>
                            </div>
                            <div className={`font-semibold text-sm ${
                              entry.type === 'invoice' || entry.type === 'payment' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {formatCurrency(entry.amount)}
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredBookEntries.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          No entries found
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Manual Match Action */}
            {(selectedBankTx || selectedBookEntry) && (
              <Card className="bg-slate-50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        {selectedBankTx && selectedBookEntry
                          ? 'Ready to match'
                          : selectedBankTx
                          ? 'Select a book entry to match with'
                          : 'Select a bank transaction to match with'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedBankTx(null);
                          setSelectedBookEntry(null);
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Clear Selection
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleManualMatch}
                        disabled={!selectedBankTx || !selectedBookEntry}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        Create Match
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Adjustments Tab */}
          <TabsContent value="adjustments">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Reconciliation Adjustments</CardTitle>
                    <CardDescription>
                      Add adjustments for outstanding items like checks not cleared or deposits in transit
                    </CardDescription>
                  </div>
                  <Button onClick={() => setAdjustmentDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Adjustment
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {summary && (summary.outstandingDeposits.length > 0 || summary.outstandingChecks.length > 0 || summary.otherAdjustments.length > 0) ? (
                  <div className="space-y-6">
                    {summary.outstandingDeposits.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Deposits in Transit</h4>
                        <div className="space-y-2">
                          {summary.outstandingDeposits.map(adj => (
                            <div key={adj.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                              <div>
                                <p className="font-medium">{adj.description}</p>
                                {adj.referenceNumber && (
                                  <p className="text-sm text-muted-foreground">Ref: {adj.referenceNumber}</p>
                                )}
                              </div>
                              <span className="font-semibold text-green-600">
                                +{formatCurrency(adj.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {summary.outstandingChecks.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Outstanding Checks</h4>
                        <div className="space-y-2">
                          {summary.outstandingChecks.map(adj => (
                            <div key={adj.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                              <div>
                                <p className="font-medium">{adj.description}</p>
                                {adj.referenceNumber && (
                                  <p className="text-sm text-muted-foreground">Check #: {adj.referenceNumber}</p>
                                )}
                              </div>
                              <span className="font-semibold text-red-600">
                                -{formatCurrency(adj.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {summary.otherAdjustments.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Other Adjustments</h4>
                        <div className="space-y-2">
                          {summary.otherAdjustments.map(adj => (
                            <div key={adj.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                              <div>
                                <p className="font-medium">{adj.description}</p>
                                <p className="text-sm text-muted-foreground capitalize">
                                  {adj.adjustmentType.replace('_', ' ')}
                                </p>
                              </div>
                              <span className="font-semibold">
                                {formatCurrency(adj.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No adjustments added yet</p>
                    <p className="text-sm mt-1">Add adjustments for items that appear on one side but not the other</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Report Tab */}
          <TabsContent value="report">
            {summary && (
              <ReconciliationReport summary={summary} />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Adjustment Dialog */}
      <AdjustmentDialog
        open={adjustmentDialogOpen}
        onOpenChange={setAdjustmentDialogOpen}
        sessionId={session.id}
        onAdjustmentCreated={loadData}
      />

      {/* Complete Confirmation Dialog */}
      <AlertDialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Reconciliation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the reconciliation as complete and lock it from further changes.
              Make sure all transactions are properly matched and adjustments are recorded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete}>
              Complete Reconciliation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

