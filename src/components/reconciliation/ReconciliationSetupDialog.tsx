/**
 * Reconciliation Setup Dialog
 * 
 * Wizard for setting up a new reconciliation session:
 * - Select bank account
 * - Enter statement period
 * - Enter statement opening/closing balances
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, DollarSign, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { reconciliationService } from '@/services/reconciliationService';
import { BankAccount } from '@/types/bankTransaction';
import { ReconciliationSession, ReconciliationSetup } from '@/types/reconciliation';

interface ReconciliationSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccountId: string;
  bankAccounts: BankAccount[];
  onSessionCreated: (session: ReconciliationSession) => void;
}

export function ReconciliationSetupDialog({
  open,
  onOpenChange,
  bankAccountId,
  bankAccounts,
  onSessionCreated,
}: ReconciliationSetupDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAccount, setSelectedAccount] = useState(bankAccountId);
  const [statementStartDate, setStatementStartDate] = useState('');
  const [statementEndDate, setStatementEndDate] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedAccount(bankAccountId);
      setStatementStartDate('');
      setStatementEndDate('');
      setOpeningBalance('');
      setClosingBalance('');
      setError(null);
      
      // Default to current month
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStatementStartDate(firstOfMonth.toISOString().split('T')[0]);
      setStatementEndDate(lastOfMonth.toISOString().split('T')[0]);
    }
  }, [open, bankAccountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!selectedAccount) {
      setError('Please select a bank account');
      return;
    }
    if (!statementStartDate || !statementEndDate) {
      setError('Please enter the statement period dates');
      return;
    }
    if (new Date(statementStartDate) > new Date(statementEndDate)) {
      setError('Start date must be before end date');
      return;
    }
    if (!openingBalance || !closingBalance) {
      setError('Please enter the statement balances');
      return;
    }

    setLoading(true);
    try {
      const setup: ReconciliationSetup = {
        bankAccountId: selectedAccount,
        statementStartDate,
        statementEndDate,
        statementOpeningBalance: parseFloat(openingBalance),
        statementClosingBalance: parseFloat(closingBalance),
      };

      const session = await reconciliationService.createSession(setup);
      onSessionCreated(session);
    } catch (err) {
      console.error('Error creating session:', err);
      setError(err instanceof Error ? err.message : 'Failed to create reconciliation session');
    } finally {
      setLoading(false);
    }
  };

  const selectedBankAccount = bankAccounts.find(a => a.id === selectedAccount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Start Bank Reconciliation
            </DialogTitle>
            <DialogDescription>
              Enter the details from your bank statement to begin reconciliation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Bank Account Selection */}
            <div className="space-y-2">
              <Label htmlFor="account">Bank Account</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger id="account">
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
              {selectedBankAccount && (
                <p className="text-xs text-muted-foreground">
                  Account: {selectedBankAccount.accountNumber} | Current Balance: $
                  {selectedBankAccount.currentBalance.toFixed(2)}
                </p>
              )}
            </div>

            {/* Statement Period */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Statement Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={statementStartDate}
                  onChange={(e) => setStatementStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Statement End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={statementEndDate}
                  onChange={(e) => setStatementEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Statement Balances */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                Statement Balances (from your bank statement)
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="openingBalance">Opening Balance</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="openingBalance"
                      type="number"
                      step="0.01"
                      className="pl-7"
                      placeholder="0.00"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="closingBalance">Closing Balance</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="closingBalance"
                      type="number"
                      step="0.01"
                      className="pl-7"
                      placeholder="0.00"
                      value={closingBalance}
                      onChange={(e) => setClosingBalance(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Calculated Net Change */}
            {openingBalance && closingBalance && (
              <div className="rounded-lg bg-slate-50 p-4 space-y-2">
                <p className="text-sm font-medium">Statement Summary</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Net Change:</span>
                    <span className={`ml-2 font-semibold ${
                      parseFloat(closingBalance) - parseFloat(openingBalance) >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      ${(parseFloat(closingBalance) - parseFloat(openingBalance)).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Period:</span>
                    <span className="ml-2">
                      {statementStartDate && statementEndDate && (
                        `${Math.ceil((new Date(statementEndDate).getTime() - new Date(statementStartDate).getTime()) / (1000 * 60 * 60 * 24))} days`
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Reconciliation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

