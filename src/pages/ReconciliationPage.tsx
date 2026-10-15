/**
 * Bank Reconciliation Page
 * 
 * Main page for bank reconciliation workflow including:
 * - Reconciliation session management
 * - Auto and manual matching
 * - Adjustments and reports
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  FileCheck,
  Clock,
  Lock,
  AlertCircle,
  Calendar,
  Building2,
  RefreshCw,
  CheckCircle2,
  ListChecks,
} from 'lucide-react';

import { bankAccountService } from '@/services/bankAccountService';
import { reconciliationService } from '@/services/reconciliationService';
import { BankAccount } from '@/types/bankTransaction';
import { ReconciliationSession } from '@/types/reconciliation';

import { ReconciliationSetupDialog } from '@/components/reconciliation/ReconciliationSetupDialog';
import { ReconciliationWorkspace } from '@/components/reconciliation/ReconciliationWorkspace';

export default function ReconciliationPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [sessions, setSessions] = useState<ReconciliationSession[]>([]);
  const [activeSession, setActiveSession] = useState<ReconciliationSession | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);

  // Load bank accounts
  useEffect(() => {
    loadBankAccounts();
  }, []);

  // Load sessions when account changes
  useEffect(() => {
    if (selectedAccountId) {
      loadSessions(selectedAccountId);
    }
  }, [selectedAccountId]);

  // Handle URL params for session
  useEffect(() => {
    const sessionId = searchParams.get('session');
    if (sessionId && sessions.length > 0) {
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        setActiveSession(session);
      }
    }
  }, [searchParams, sessions]);

  const loadBankAccounts = async () => {
    try {
      const accounts = await bankAccountService.getBankAccounts();
      setBankAccounts(accounts.filter(a => a.isActive));
      
      // Auto-select first account
      if (accounts.length > 0) {
        setSelectedAccountId(accounts[0].id);
      }
    } catch (error) {
      console.error('Error loading bank accounts:', error);
      toast.error('Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async (accountId: string) => {
    try {
      const sessionList = await reconciliationService.getSessions(accountId);
      setSessions(sessionList);
    } catch (error) {
      console.error('Error loading sessions:', error);
      toast.error('Failed to load reconciliation sessions');
    }
  };

  const handleSessionCreated = (session: ReconciliationSession) => {
    setSessions(prev => [session, ...prev]);
    setActiveSession(session);
    setSearchParams({ session: session.id });
    setSetupDialogOpen(false);
    toast.success('Reconciliation session created');
  };

  const handleOpenSession = (session: ReconciliationSession) => {
    setActiveSession(session);
    setSearchParams({ session: session.id });
  };

  const handleCloseWorkspace = () => {
    setActiveSession(null);
    setSearchParams({});
    loadSessions(selectedAccountId);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return (
          <Badge className="bg-amber-100 text-amber-700 gap-1">
            <Clock className="h-3 w-3" />
            In Progress
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-emerald-100 text-emerald-700 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        );
      case 'locked':
        return (
          <Badge className="bg-slate-100 text-slate-700 gap-1">
            <Lock className="h-3 w-3" />
            Locked
          </Badge>
        );
      default:
        return null;
    }
  };

  // Show workspace if session is active
  if (activeSession) {
    return (
      <ReconciliationWorkspace
        session={activeSession}
        bankAccountId={selectedAccountId}
        onClose={handleCloseWorkspace}
        onSessionUpdate={(updated) => setActiveSession(updated)}
      />
    );
  }

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
    <div className="space-y-6">
      <PageHeader
        title="Bank Reconciliation"
        description="Match bank statements with your accounting records"
        backTo="/bank-accounts"
      />

      {/* Bank Account Selector */}
      {bankAccounts.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No bank accounts found. Please add a bank account first to start reconciliation.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger className="w-[300px]">
                      <SelectValue placeholder="Select bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map(account => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.accountName} - {account.bankName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => setSetupDialogOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Reconciliation
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* Sessions List */}
          {sessions.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <FileCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No reconciliation sessions</h3>
                  <p className="text-muted-foreground mb-4">
                    Start your first bank reconciliation to match transactions
                  </p>
                  <Button onClick={() => setSetupDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Start Reconciliation
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Reconciliation History</h2>
                <Button variant="outline" size="sm" onClick={() => loadSessions(selectedAccountId)} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>

              <div className="grid gap-4">
                {sessions.map(session => (
                  <Card
                    key={session.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => handleOpenSession(session)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {formatDate(session.statementStartDate)} - {formatDate(session.statementEndDate)}
                            </span>
                            {getStatusBadge(session.status)}
                          </div>
                          <div className="flex items-center gap-6 text-sm text-muted-foreground">
                            <span>
                              Opening: {formatCurrency(session.statementOpeningBalance)}
                            </span>
                            <span>
                              Closing: {formatCurrency(session.statementClosingBalance)}
                            </span>
                            {session.matchedCount > 0 && (
                              <span className="flex items-center gap-1">
                                <ListChecks className="h-3 w-3" />
                                {session.matchedCount} matched
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          {session.status === 'in_progress' && session.unmatchedBankCount > 0 && (
                            <Badge variant="outline" className="text-amber-600 border-amber-600">
                              {session.unmatchedBankCount} unmatched
                            </Badge>
                          )}
                          {session.difference !== 0 && session.status !== 'completed' && (
                            <span className="text-red-600 font-medium">
                              Diff: {formatCurrency(session.difference)}
                            </span>
                          )}
                          <Button variant="outline" size="sm">
                            {session.status === 'completed' ? 'View' : 'Continue'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Setup Dialog */}
      <ReconciliationSetupDialog
        open={setupDialogOpen}
        onOpenChange={setSetupDialogOpen}
        bankAccountId={selectedAccountId}
        bankAccounts={bankAccounts}
        onSessionCreated={handleSessionCreated}
      />
    </div>
  );
}

