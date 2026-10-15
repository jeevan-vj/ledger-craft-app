import { supabase } from '@/integrations/supabase/client';
import { parseCSVTransactions } from './csvTransactionParser';
import { bankAccountService } from './bankAccountService';
import { bankApi, bankApiEnabled, toBankTransaction } from '@/features/bank/api/bankApi';
import {
  TransactionImportConfig,
  ImportedTransaction,
  BankTransaction,
  TransactionImportResult,
  ImportValidationResult,
  SupabaseBankTransaction
} from '../types/bankTransaction';

interface DuplicateDetectionOptions {
  fuzzyMatch?: boolean;
  dateToleranceDays?: number;
}

interface ImportSummary {
  totalProcessed: number;
  successfulImports: number;
  duplicatesSkipped: number;
  errorsCount: number;
  categorizedCount: number;
  dateRange: {
    earliest: string;
    latest: string;
  };
}

const mapBankTransactionToSupabaseBankTransaction = async (
  transaction: Omit<BankTransaction, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Omit<SupabaseBankTransaction, 'id' | 'created_at' | 'updated_at'>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id || '';

  return {
    bank_account_id: transaction.bankAccountId,
    transaction_date: transaction.transactionDate,
    description: transaction.description,
    reference: transaction.reference || null,
    amount: transaction.amount,
    type: transaction.type,
    balance: transaction.balance || null,
    category: transaction.category || null,
    merchant: transaction.merchant || null,
    is_reconciled: transaction.isReconciled,
    notes: transaction.notes || null,
    user_id: transaction.userId || userId,
  };
};

const mapSupabaseBankTransactionToBankTransaction = (transaction: SupabaseBankTransaction): BankTransaction => ({
  id: transaction.id,
  bankAccountId: transaction.bank_account_id,
  transactionDate: transaction.transaction_date,
  description: transaction.description,
  reference: transaction.reference,
  amount: transaction.amount,
  type: transaction.type,
  balance: transaction.balance,
  category: transaction.category,
  merchant: transaction.merchant,
  isReconciled: transaction.is_reconciled,
  notes: transaction.notes,
  userId: transaction.user_id,
  createdAt: transaction.created_at,
  updatedAt: transaction.updated_at,
});

// Category mapping based on common transaction patterns
const CATEGORY_PATTERNS = [
  // Food & Dining
  { patterns: ['starbucks', 'mcdonald', 'kfc', 'burger', 'pizza', 'restaurant', 'cafe', 'coffee'], category: 'Food & Dining' },
  // Transportation
  { patterns: ['shell', 'bp', 'mobil', 'gas', 'fuel', 'petrol', 'taxi', 'uber', 'lyft'], category: 'Transportation' },
  // Shopping
  { patterns: ['amazon', 'walmart', 'target', 'mall', 'store', 'shop'], category: 'Shopping' },
  // Utilities
  { patterns: ['electric', 'power', 'water', 'gas company', 'internet', 'phone'], category: 'Utilities' },
  // Income
  { patterns: ['salary', 'wages', 'payroll', 'deposit', 'income'], category: 'Income' },
  // Banking
  { patterns: ['atm', 'bank fee', 'transfer', 'withdrawal'], category: 'Banking' },
  // Healthcare
  { patterns: ['pharmacy', 'doctor', 'medical', 'hospital', 'clinic'], category: 'Healthcare' },
];

export const transactionImportService = {
  async importTransactions(
    fileData: string,
    config: TransactionImportConfig
  ): Promise<TransactionImportResult> {
    try {
      // Validate bank account exists and user has access
      const accountExists = await this.validateBankAccount(config.bankAccountId);
      if (!accountExists) {
        return {
          success: false,
          importedCount: 0,
          duplicatesSkipped: 0,
          errors: ['Bank account not found or access denied'],
          transactions: []
        };
      }

      // Parse the file data based on type
      let importedTransactions: ImportedTransaction[] = [];
      let parseErrors: string[] = [];

      if (config.fileType === 'csv') {
        const parseResult = await parseCSVTransactions(
          fileData,
          config.csvMapping!,
          config.dateFormat
        );

        if (!parseResult.success) {
          return {
            success: false,
            importedCount: 0,
            duplicatesSkipped: 0,
            errors: parseResult.errors,
            transactions: []
          };
        }

        importedTransactions = parseResult.transactions;
        parseErrors = parseResult.errors || [];
      } else {
        return {
          success: false,
          importedCount: 0,
          duplicatesSkipped: 0,
          errors: ['PDF import not yet implemented'],
          transactions: []
        };
      }

      // Validate imported data
      const validation = this.validateImportData(importedTransactions);
      if (!validation.isValid) {
        return {
          success: false,
          importedCount: 0,
          duplicatesSkipped: 0,
          errors: validation.errors.map(e => `Row ${e.row + 1}: ${e.field} - ${e.message}`),
          transactions: []
        };
      }

      // Auto-categorize transactions
      const categorizedTransactions = this.categorizeTransactions(importedTransactions);

      if (bankApiEnabled()) {
        const result = await bankApi.importTransactions({
          bankAccountId: config.bankAccountId,
          fileName: 'import.csv',
          fileType: config.fileType === 'pdf' ? 'pdf' : 'csv',
          skipDuplicates: config.skipDuplicates,
          transactions: categorizedTransactions.map((importedTx) => ({
            transactionDate: importedTx.date,
            description: importedTx.description,
            reference: importedTx.reference ?? null,
            amount: String(importedTx.amount),
            type: importedTx.type,
            balance: importedTx.balance == null ? null : String(importedTx.balance),
            category: importedTx.category ?? null,
            merchant: importedTx.merchant ?? null,
          })),
        });
        return {
          success: true,
          importedCount: result.importedCount,
          duplicatesSkipped: result.duplicatesSkipped,
          errors: parseErrors,
          transactions: result.transactions.map(toBankTransaction),
        };
      }

      // Check for duplicates if enabled
      let duplicateIndices: number[] = [];
      if (config.skipDuplicates) {
        const existingTransactions = await this.getExistingTransactions(config.bankAccountId);
        duplicateIndices = this.detectDuplicates(categorizedTransactions, existingTransactions);
      }

      // Filter out duplicates
      const transactionsToImport = categorizedTransactions.filter((_, index) => 
        !duplicateIndices.includes(index)
      );

      // Convert to BankTransaction format and save
      const savedTransactions: BankTransaction[] = [];
      const importErrors: string[] = [...parseErrors];

      for (const importedTx of transactionsToImport) {
        try {
          const bankTransaction: Omit<BankTransaction, 'id' | 'createdAt' | 'updatedAt'> = {
            bankAccountId: config.bankAccountId,
            transactionDate: importedTx.date,
            description: importedTx.description,
            reference: importedTx.reference,
            amount: importedTx.amount,
            type: importedTx.type,
            balance: importedTx.balance,
            category: importedTx.category,
            merchant: importedTx.merchant,
            isReconciled: false,
            notes: undefined
          };

          const saved = await this.saveBankTransaction(bankTransaction);
          savedTransactions.push(saved);
        } catch (error) {
          importErrors.push(`Failed to save transaction: ${importedTx.description} - ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return {
        success: importErrors.length === 0,
        importedCount: savedTransactions.length,
        duplicatesSkipped: duplicateIndices.length,
        errors: importErrors,
        transactions: savedTransactions
      };

    } catch (error) {
      return {
        success: false,
        importedCount: 0,
        duplicatesSkipped: 0,
        errors: [`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        transactions: []
      };
    }
  },

  async validateBankAccount(bankAccountId: string): Promise<boolean> {
    try {
      const account = await bankAccountService.getBankAccount(bankAccountId);
      return account !== null && account.isActive;
    } catch (error) {
      console.error('Error validating bank account:', error);
      return false;
    }
  },

  async getExistingTransactions(bankAccountId: string): Promise<BankTransaction[]> {
    if (bankApiEnabled()) {
      return bankApi.listTransactions({ bankAccountId });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return [];
    }

    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching existing transactions:', error);
      return [];
    }

    return (data as SupabaseBankTransaction[]).map(mapSupabaseBankTransactionToBankTransaction);
  },

  detectDuplicates(
    importedTransactions: ImportedTransaction[],
    existingTransactions: BankTransaction[],
    options: DuplicateDetectionOptions = {}
  ): number[] {
    const duplicateIndices: number[] = [];
    const { fuzzyMatch = false, dateToleranceDays = 0 } = options;

    for (let i = 0; i < importedTransactions.length; i++) {
      const imported = importedTransactions[i];
      
      const isDuplicate = existingTransactions.some(existing => {
        // Check date match (with tolerance if specified)
        const importedDate = new Date(imported.date);
        const existingDate = new Date(existing.transactionDate);
        const daysDiff = Math.abs((importedDate.getTime() - existingDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > dateToleranceDays) {
          return false;
        }

        // Check amount match (exact)
        if (Math.abs(imported.amount - existing.amount) > 0.01) {
          return false;
        }

        // Check type match
        if (imported.type !== existing.type) {
          return false;
        }

        // Check description match
        if (fuzzyMatch) {
          return this.fuzzyDescriptionMatch(imported.description, existing.description);
        } else {
          return imported.description.trim().toLowerCase() === existing.description.trim().toLowerCase();
        }
      });

      if (isDuplicate) {
        duplicateIndices.push(i);
      }
    }

    return duplicateIndices;
  },

  fuzzyDescriptionMatch(desc1: string, desc2: string): boolean {
    // Simple fuzzy matching - remove common variations and compare
    const normalize = (str: string) => str
      .toLowerCase()
      .replace(/[#\d\s]+/g, ' ') // Remove numbers and special chars
      .replace(/\s+/g, ' ')
      .trim();

    const normalized1 = normalize(desc1);
    const normalized2 = normalize(desc2);

    // Check if one contains the other (for cases like "STARBUCKS #123" vs "STARBUCKS MAIN ST")
    return normalized1.includes(normalized2) || normalized2.includes(normalized1);
  },

  categorizeTransactions(transactions: ImportedTransaction[]): ImportedTransaction[] {
    return transactions.map(transaction => {
      const description = transaction.description.toLowerCase();
      
      for (const categoryMapping of CATEGORY_PATTERNS) {
        if (categoryMapping.patterns.some(pattern => description.includes(pattern))) {
          return {
            ...transaction,
            category: categoryMapping.category
          };
        }
      }

      return transaction; // No category found
    });
  },

  validateImportData(transactions: ImportedTransaction[]): ImportValidationResult {
    const errors: Array<{ row: number; field: string; message: string }> = [];
    const warnings: Array<{ row: number; field: string; message: string }> = [];

    transactions.forEach((transaction, index) => {
      // Validate date
      const date = new Date(transaction.date);
      if (isNaN(date.getTime())) {
        errors.push({
          row: index,
          field: 'date',
          message: 'Invalid date format'
        });
      }

      // Validate description
      if (!transaction.description || transaction.description.trim().length === 0) {
        errors.push({
          row: index,
          field: 'description',
          message: 'Description is required'
        });
      }

      // Validate amount
      if (transaction.amount <= 0) {
        errors.push({
          row: index,
          field: 'amount',
          message: 'Amount must be greater than zero'
        });
      }

      // Validate type
      if (!['debit', 'credit'].includes(transaction.type)) {
        errors.push({
          row: index,
          field: 'type',
          message: 'Type must be debit or credit'
        });
      }

      // Warnings for potential issues
      if (transaction.amount > 10000) {
        warnings.push({
          row: index,
          field: 'amount',
          message: 'Large transaction amount - please verify'
        });
      }

      if (transaction.description.length > 255) {
        warnings.push({
          row: index,
          field: 'description',
          message: 'Description is very long and may be truncated'
        });
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  },

  async saveBankTransaction(
    transaction: Omit<BankTransaction, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<BankTransaction> {
    const supabaseTransaction = await mapBankTransactionToSupabaseBankTransaction(transaction);

    const { data, error } = await supabase
      .from('bank_transactions')
      .insert([supabaseTransaction])
      .select()
      .single();

    if (error) {
      console.error('Error saving bank transaction:', error);
      throw error;
    }

    return mapSupabaseBankTransactionToBankTransaction(data as SupabaseBankTransaction);
  },

  getImportSummary(result: TransactionImportResult): ImportSummary {
    const dates = result.transactions
      .map(t => t.transactionDate)
      .sort();

    const categorizedCount = result.transactions
      .filter(t => t.category && t.category.length > 0)
      .length;

    return {
      totalProcessed: result.importedCount + result.duplicatesSkipped,
      successfulImports: result.importedCount,
      duplicatesSkipped: result.duplicatesSkipped,
      errorsCount: result.errors.length,
      categorizedCount,
      dateRange: {
        earliest: dates[0] || '',
        latest: dates[dates.length - 1] || ''
      }
    };
  }
};