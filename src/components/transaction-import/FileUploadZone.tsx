import React, { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Upload, 
  FileText, 
  AlertCircle, 
  Check,
  File,
  Building2,
  CreditCard
} from 'lucide-react';
import { BankAccount } from '@/types/bankTransaction';
import { cn } from '@/lib/utils';

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  bankAccounts: BankAccount[];
  selectedAccount: BankAccount | null;
  onAccountSelect: (account: BankAccount) => void;
  loading?: boolean;
}

export function FileUploadZone({
  onFileSelect,
  bankAccounts,
  selectedAccount,
  onAccountSelect,
  loading = false
}: FileUploadZoneProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
    setUploadError(null);

    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.errors.some((e) => e.code === 'file-too-large')) {
        setUploadError('File is too large. Maximum size is 10MB.');
      } else if (rejection.errors.some((e) => e.code === 'file-invalid-type')) {
        setUploadError('Invalid file type. Please upload a CSV or PDF file.');
      } else {
        setUploadError('File upload failed. Please try again.');
      }
      return;
    }

    if (acceptedFiles.length > 0) {
      if (!selectedAccount) {
        setUploadError('Please select a bank account first.');
        return;
      }
      onFileSelect(acceptedFiles[0]);
    }
  }, [onFileSelect, selectedAccount]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: false,
    disabled: loading
  });

  const getAccountTypeIcon = (type: string) => {
    switch (type) {
      case 'credit_card':
        return <CreditCard className="w-4 h-4" />;
      case 'business':
        return <Building2 className="w-4 h-4" />;
      default:
        return <Building2 className="w-4 h-4" />;
    }
  };

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case 'checking':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'savings':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'credit_card':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'business':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatBalance = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  return (
    <div className="space-y-8">
      {/* Bank Account Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Select Bank Account
          </CardTitle>
          <CardDescription>
            Choose the bank account to import transactions into
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bankAccounts.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No active bank accounts found. Please add a bank account first.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {bankAccounts.map((account) => (
                <Card
                  key={account.id}
                  className={cn(
                    "cursor-pointer transition-all duration-200 hover:shadow-md",
                    selectedAccount?.id === account.id
                      ? "ring-2 ring-primary border-primary"
                      : "hover:border-muted-foreground/50"
                  )}
                  onClick={() => onAccountSelect(account)}
                >
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getAccountTypeIcon(account.accountType)}
                          <span className="font-medium truncate">
                            {account.accountName}
                          </span>
                        </div>
                        {selectedAccount?.id === account.id && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">
                          {account.bankName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {account.accountNumber}
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className={cn("text-xs", getAccountTypeColor(account.accountType))}
                        >
                          {account.accountType.replace('_', ' ').toUpperCase()}
                        </Badge>
                        <span className="text-sm font-medium">
                          {formatBalance(account.currentBalance, account.currency)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Upload Zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Bank Statement
          </CardTitle>
          <CardDescription>
            Drag and drop your bank statement file or click to browse
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              isDragActive && !isDragReject && "border-primary bg-primary/5",
              isDragReject && "border-destructive bg-destructive/5",
              loading && "opacity-50 cursor-not-allowed",
              !selectedAccount && "opacity-50 cursor-not-allowed",
              selectedAccount && !isDragActive && !isDragReject && "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/25"
            )}
          >
            <input {...getInputProps()} />
            
            <div className="space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                {loading ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                ) : isDragActive ? (
                  <Upload className="w-8 h-8 text-primary" />
                ) : (
                  <FileText className="w-8 h-8 text-muted-foreground" />
                )}
              </div>

              <div className="space-y-2">
                {loading ? (
                  <p className="text-lg font-medium">Processing file...</p>
                ) : isDragActive ? (
                  <p className="text-lg font-medium text-primary">
                    Drop your file here
                  </p>
                ) : !selectedAccount ? (
                  <p className="text-lg font-medium text-muted-foreground">
                    Select a bank account first
                  </p>
                ) : (
                  <>
                    <p className="text-lg font-medium">
                      Drop your bank statement here, or{' '}
                      <span className="text-primary">click to browse</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Supports CSV and PDF files up to 10MB
                    </p>
                  </>
                )}
              </div>

              {!loading && selectedAccount && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Badge variant="outline" className="flex items-center gap-1">
                    <File className="w-3 h-3" />
                    CSV
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    PDF
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {uploadError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{uploadError}</AlertDescription>
            </Alert>
          )}

          {selectedAccount && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Selected Account:</strong> {selectedAccount.accountName} ({selectedAccount.bankName})
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supported Formats Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Supported File Formats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <File className="w-4 h-4" />
                CSV Files
              </h4>
              <p className="text-sm text-muted-foreground">
                Comma-separated values exported from your bank's online portal
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Standard bank export format</li>
                <li>• Must include date, description, and amount columns</li>
                <li>• Automatic column mapping available</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                PDF Files
              </h4>
              <p className="text-sm text-muted-foreground">
                Bank statements in PDF format (coming soon)
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Automatic text extraction</li>
                <li>• Transaction pattern recognition</li>
                <li>• Support for major NZ banks</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}