import React, { useState, useEffect } from 'react';
import { BankAccount } from '@/types/bankTransaction';
import { bankAccountService } from '@/services/bankAccountService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, CreditCard, Building, Landmark, Wallet, Upload, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { BankAccountDialog } from '@/components/bank-account/BankAccountDialog';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';

const ACCOUNT_TYPE_CONFIG = {
  checking: { label: 'Checking', icon: Building, color: 'bg-blue-500' },
  savings: { label: 'Savings', icon: Landmark, color: 'bg-green-500' },
  credit_card: { label: 'Credit Card', icon: CreditCard, color: 'bg-red-500' },
  business: { label: 'Business', icon: Wallet, color: 'bg-purple-500' }
};

export default function BankAccountsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const accountList = await bankAccountService.getBankAccounts();
      setAccounts(accountList);
    } catch (error) {
      console.error('Error loading bank accounts:', error);
      toast.error('Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleCreateAccount = () => {
    setEditingAccount(null);
    setDialogOpen(true);
  };

  const handleEditAccount = (account: BankAccount) => {
    setEditingAccount(account);
    setDialogOpen(true);
  };

  const handleDeleteAccount = async (account: BankAccount) => {
    if (!window.confirm(`Are you sure you want to delete "${account.accountName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await bankAccountService.deleteBankAccount(account.id);
      toast.success('Bank account deleted successfully');
      await loadAccounts();
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Failed to delete bank account');
    }
  };

  const handleAccountSaved = async () => {
    setDialogOpen(false);
    setEditingAccount(null);
    await loadAccounts();
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

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
        title="Bank Accounts"
        description="Manage your bank accounts for transaction imports and reconciliation"
        actions={
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => navigate('/transaction-import')} 
            className="gap-2"
            disabled={accounts.length === 0}
          >
            <Upload className="h-4 w-4" />
            Import Transactions
          </Button>
          <Button 
            variant="outline" 
            onClick={() => navigate('/reconciliation')} 
            className="gap-2"
            disabled={accounts.length === 0}
          >
            <ArrowRightLeft className="h-4 w-4" />
            Reconcile
          </Button>
          <Button onClick={handleCreateAccount} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Bank Account
          </Button>
        </div>
        }
      />

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Landmark className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No bank accounts found</h3>
              <p className="text-muted-foreground mb-4">
                Add your first bank account to start importing transactions
              </p>
              <Button onClick={handleCreateAccount} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Bank Account
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => {
            const config = ACCOUNT_TYPE_CONFIG[account.accountType];
            const Icon = config.icon;
            const isNegativeBalance = account.currentBalance < 0;
            const isCredit = account.accountType === 'credit_card';

            return (
              <Card key={account.id} className={`${!account.isActive ? 'opacity-50' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${config.color} text-white`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{account.accountName}</CardTitle>
                        <CardDescription className="text-sm">
                          {account.bankName} • {account.accountNumber}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!account.isActive && (
                        <Badge variant="secondary" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {config.label}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Current Balance</span>
                      <span className={`font-semibold ${
                        isNegativeBalance && !isCredit ? 'text-red-600' : 
                        isNegativeBalance && isCredit ? 'text-orange-600' :
                        'text-green-600'
                      }`}>
                        {formatCurrency(account.currentBalance, account.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Opening Balance</span>
                      <span>{formatCurrency(account.openingBalance, account.currency)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditAccount(account)}
                      className="flex-1 gap-2"
                    >
                      <Edit className="h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteAccount(account)}
                      className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BankAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editingAccount}
        onSaved={handleAccountSaved}
      />
    </div>
  );
}