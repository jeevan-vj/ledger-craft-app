import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  Eye,
  ArrowLeft,
  Calendar,
  CreditCard,
  DollarSign,
  TrendingUp
} from 'lucide-react';
import { bankAccountService } from '@/services/bankAccountService';
import { PageHeader } from '@/components/layout/PageHeader';
import { BankAccount, TransactionImportResult, ImportedTransaction } from '@/types/bankTransaction';
import { FileUploadZone } from '@/components/transaction-import/FileUploadZone';
import { ImportPreview } from '@/components/transaction-import/ImportPreview';
import { ImportConfiguration } from '@/components/transaction-import/ImportConfiguration';
import { ImportSummary } from '@/components/transaction-import/ImportSummary';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

type ImportStep = 'upload' | 'configure' | 'preview' | 'complete';

interface ImportState {
  step: ImportStep;
  file: File | null;
  bankAccount: BankAccount | null;
  parseResult: any | null;
  importResult: TransactionImportResult | null;
  loading: boolean;
  error: string | null;
}

export default function TransactionImportPage() {
  const navigate = useNavigate();
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [importState, setImportState] = useState<ImportState>({
    step: 'upload',
    file: null,
    bankAccount: null,
    parseResult: null,
    importResult: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    loadBankAccounts();
  }, []);

  const loadBankAccounts = async () => {
    try {
      const accounts = await bankAccountService.getBankAccounts();
      setBankAccounts(accounts.filter(account => account.isActive));
    } catch (error) {
      console.error('Failed to load bank accounts:', error);
      toast.error('Failed to load bank accounts');
    }
  };

  const handleFileSelect = (file: File) => {
    setImportState(prev => ({
      ...prev,
      file,
      step: 'configure',
      error: null,
    }));
  };

  const handleBankAccountSelect = (account: BankAccount) => {
    setImportState(prev => ({
      ...prev,
      bankAccount: account,
    }));
  };

  const handleConfigurationComplete = (parseResult: any) => {
    setImportState(prev => ({
      ...prev,
      parseResult,
      step: 'preview',
    }));
  };

  const handleImportConfirm = async (importResult: TransactionImportResult) => {
    setImportState(prev => ({
      ...prev,
      importResult,
      step: 'complete',
    }));
  };

  const handleStartOver = () => {
    setImportState({
      step: 'upload',
      file: null,
      bankAccount: null,
      parseResult: null,
      importResult: null,
      loading: false,
      error: null,
    });
  };

  const getStepNumber = (step: ImportStep): number => {
    const steps = { upload: 1, configure: 2, preview: 3, complete: 4 };
    return steps[step];
  };

  const getCurrentStepProgress = (): number => {
    return ((getStepNumber(importState.step) - 1) / 3) * 100;
  };

  const renderHeader = () => (
    <div className="space-y-4">
      <PageHeader
        title="Import Transactions"
        description="Upload your bank statement (CSV or PDF) to automatically import transactions"
        backTo="/bank-accounts"
      />

      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Step {getStepNumber(importState.step)} of 4</span>
          <span>{Math.round(getCurrentStepProgress())}% complete</span>
        </div>
        <Progress value={getCurrentStepProgress()} className="h-2" />
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className={`flex items-center gap-2 ${importState.step === 'upload' ? 'text-primary' : importState.step === 'configure' || importState.step === 'preview' || importState.step === 'complete' ? 'text-green-600' : 'text-muted-foreground'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${importState.step === 'upload' ? 'bg-primary text-primary-foreground' : importState.step === 'configure' || importState.step === 'preview' || importState.step === 'complete' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
            {importState.step === 'configure' || importState.step === 'preview' || importState.step === 'complete' ? <CheckCircle className="w-3 h-3" /> : '1'}
          </div>
          Upload File
        </div>
        
        <div className={`flex items-center gap-2 ${importState.step === 'configure' ? 'text-primary' : importState.step === 'preview' || importState.step === 'complete' ? 'text-green-600' : 'text-muted-foreground'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${importState.step === 'configure' ? 'bg-primary text-primary-foreground' : importState.step === 'preview' || importState.step === 'complete' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
            {importState.step === 'preview' || importState.step === 'complete' ? <CheckCircle className="w-3 h-3" /> : '2'}
          </div>
          Configure Import
        </div>
        
        <div className={`flex items-center gap-2 ${importState.step === 'preview' ? 'text-primary' : importState.step === 'complete' ? 'text-green-600' : 'text-muted-foreground'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${importState.step === 'preview' ? 'bg-primary text-primary-foreground' : importState.step === 'complete' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
            {importState.step === 'complete' ? <CheckCircle className="w-3 h-3" /> : '3'}
          </div>
          Preview & Confirm
        </div>
        
        <div className={`flex items-center gap-2 ${importState.step === 'complete' ? 'text-green-600' : 'text-muted-foreground'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${importState.step === 'complete' ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
            {importState.step === 'complete' ? <CheckCircle className="w-3 h-3" /> : '4'}
          </div>
          Complete
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (importState.step) {
      case 'upload':
        return (
          <FileUploadZone
            onFileSelect={handleFileSelect}
            bankAccounts={bankAccounts}
            selectedAccount={importState.bankAccount}
            onAccountSelect={handleBankAccountSelect}
            loading={importState.loading}
          />
        );

      case 'configure':
        return (
          <ImportConfiguration
            file={importState.file!}
            bankAccount={importState.bankAccount!}
            onConfigurationComplete={handleConfigurationComplete}
            onBack={() => setImportState(prev => ({ ...prev, step: 'upload' }))}
          />
        );

      case 'preview':
        return (
          <ImportPreview
            parseResult={importState.parseResult}
            bankAccount={importState.bankAccount!}
            onImportConfirm={handleImportConfirm}
            onBack={() => setImportState(prev => ({ ...prev, step: 'configure' }))}
          />
        );

      case 'complete':
        return (
          <ImportSummary
            importResult={importState.importResult!}
            bankAccount={importState.bankAccount!}
            onStartOver={handleStartOver}
            onViewTransactions={() => navigate('/bank-accounts')}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {renderHeader()}
      
      {importState.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{importState.error}</AlertDescription>
        </Alert>
      )}

      <div className="max-w-4xl mx-auto">
        {renderContent()}
      </div>
    </div>
  );
}