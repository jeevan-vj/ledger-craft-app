import { supabase } from '@/integrations/supabase/client';
import { accountManagementService } from './accountManagementService';

interface JournalEntry {
  id: string;
  userId: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  referenceType: string;
  referenceId: string;
  status: string;
  lines: JournalEntryLine[];
}

interface JournalEntryLine {
  accountId: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  lineOrder: number;
}

interface InvoiceJournalEntryData {
  subtotal: number;
  taxAmount: number;
  total: number;
  taxInclusive: boolean;
  date: string;
  invoiceNumber?: string;
}

interface PaymentJournalEntryData {
  amount: number;
  paymentDate: string;
  paymentMethod: string;
}

/**
 * Accounting Journal Service
 * Handles creation of journal entries for invoices and payments
 */
export class AccountingJournalService {
  /**
   * Generate next journal entry number
   */
  private async generateEntryNumber(userId: string): Promise<string> {
    const { data: existingEntries } = await supabase
      .from('journal_entries')
      .select('entry_number')
      .eq('user_id', userId)
      .order('entry_number', { ascending: false })
      .limit(1);

    const currentYear = new Date().getFullYear();
    const nextNumber =
      existingEntries && existingEntries.length > 0
        ? parseInt(existingEntries[0].entry_number.split('-')[2]) + 1
        : 1;
    return `JE-${currentYear}-${String(nextNumber).padStart(3, '0')}`;
  }

  /**
   * Create journal entry for invoice
   * 
   * DR Accounts Receivable (1200) = Total
   * CR Sales Revenue (4000) = Subtotal
   * CR GST Collected on Sales (2200) = GST Amount
   */
  async createInvoiceJournalEntry(
    userId: string,
    invoiceId: string,
    invoiceData: InvoiceJournalEntryData
  ): Promise<JournalEntry> {
    try {
      // Ensure user accounts are initialized
      await accountManagementService.initializeUserAccounts(userId);

      // Get account IDs
      const [arAccountId, salesAccountId, gstAccountId] = await Promise.all([
        accountManagementService.getOrCreateAccountByNumber(userId, '1200'), // Accounts Receivable
        accountManagementService.getOrCreateAccountByNumber(userId, '4000'), // Sales Revenue
        accountManagementService.getOrCreateAccountByNumber(userId, '2200')  // GST Collected
      ]);

      // Prepare journal entry lines
      const lines: JournalEntryLine[] = [
        {
          accountId: arAccountId,
          description: `Invoice ${invoiceData.invoiceNumber || invoiceId}`,
          debitAmount: invoiceData.total,
          creditAmount: 0,
          lineOrder: 1
        },
        {
          accountId: salesAccountId,
          description: `Sales revenue - Invoice ${invoiceData.invoiceNumber || invoiceId}`,
          debitAmount: 0,
          creditAmount: invoiceData.subtotal,
          lineOrder: 2
        }
      ];

      // Only add GST line if there's GST
      if (invoiceData.taxAmount > 0) {
        lines.push({
          accountId: gstAccountId,
          description: `GST on Invoice ${invoiceData.invoiceNumber || invoiceId}`,
          debitAmount: 0,
          creditAmount: invoiceData.taxAmount,
          lineOrder: 3
        });
      }

      // Validate: debits must equal credits
      const totalDebits = lines.reduce((sum, line) => sum + line.debitAmount, 0);
      const totalCredits = lines.reduce((sum, line) => sum + line.creditAmount, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error(
          `Journal entry unbalanced: Debits (${totalDebits}) != Credits (${totalCredits})`
        );
      }

      // Generate entry number
      const entryNumber = await this.generateEntryNumber(userId);

      // Create journal entry
      const { data: journalEntry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          user_id: userId,
          entry_number: entryNumber,
          entry_date: invoiceData.date,
          description: `Invoice ${invoiceData.invoiceNumber || invoiceId}`,
          reference_type: 'invoice',
          reference_id: invoiceId,
          total_amount: invoiceData.total,
          status: 'posted'
        })
        .select()
        .single();

      if (entryError || !journalEntry) {
        throw new Error(
          `Error creating journal entry: ${entryError?.message || 'Unknown error'}`
        );
      }

      // Create journal entry lines
      const entryLines = lines.map((line) => ({
        journal_entry_id: journalEntry.id,
        account_id: line.accountId,
        description: line.description,
        debit_amount: line.debitAmount,
        credit_amount: line.creditAmount,
        line_order: line.lineOrder
      }));

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(entryLines);

      if (linesError) {
        // Rollback journal entry if lines creation fails
        await supabase
          .from('journal_entries')
          .delete()
          .eq('id', journalEntry.id);
        throw new Error(`Error creating journal entry lines: ${linesError.message}`);
      }

      return {
        id: journalEntry.id,
        userId: journalEntry.user_id,
        entryNumber: journalEntry.entry_number,
        entryDate: journalEntry.entry_date,
        description: journalEntry.description,
        referenceType: journalEntry.reference_type || 'invoice',
        referenceId: journalEntry.reference_id || invoiceId,
        status: journalEntry.status,
        lines: lines
      };
    } catch (error) {
      console.error('Error creating invoice journal entry:', error);
      throw error;
    }
  }

  /**
   * Create journal entry for payment
   * 
   * DR Bank Account/Cash = Payment Amount
   * CR Accounts Receivable = Payment Amount
   */
  async createPaymentJournalEntry(
    userId: string,
    paymentId: string,
    invoiceId: string,
    paymentData: PaymentJournalEntryData
  ): Promise<JournalEntry> {
    try {
      // Get bank account based on payment method
      const bankAccountId =
        await accountManagementService.getBankAccountForPaymentMethod(
          userId,
          paymentData.paymentMethod
        );

      // Get Accounts Receivable account
      const arAccountId =
        await accountManagementService.getOrCreateAccountByNumber(userId, '1200');

      // Prepare journal entry lines
      const lines: JournalEntryLine[] = [
        {
          accountId: bankAccountId,
          description: `Payment received - ${paymentData.paymentMethod}`,
          debitAmount: paymentData.amount,
          creditAmount: 0,
          lineOrder: 1
        },
        {
          accountId: arAccountId,
          description: `Payment applied to invoice ${invoiceId}`,
          debitAmount: 0,
          creditAmount: paymentData.amount,
          lineOrder: 2
        }
      ];

      // Validate: debits must equal credits
      const totalDebits = lines.reduce((sum, line) => sum + line.debitAmount, 0);
      const totalCredits = lines.reduce((sum, line) => sum + line.creditAmount, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error(
          `Journal entry unbalanced: Debits (${totalDebits}) != Credits (${totalCredits})`
        );
      }

      // Generate entry number
      const entryNumber = await this.generateEntryNumber(userId);

      // Create journal entry
      const { data: journalEntry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          user_id: userId,
          entry_number: entryNumber,
          entry_date: paymentData.paymentDate,
          description: `Payment received for invoice ${invoiceId}`,
          reference_type: 'payment',
          reference_id: paymentId,
          total_amount: paymentData.amount,
          status: 'posted'
        })
        .select()
        .single();

      if (entryError || !journalEntry) {
        throw new Error(
          `Error creating journal entry: ${entryError?.message || 'Unknown error'}`
        );
      }

      // Create journal entry lines
      const entryLines = lines.map((line) => ({
        journal_entry_id: journalEntry.id,
        account_id: line.accountId,
        description: line.description,
        debit_amount: line.debitAmount,
        credit_amount: line.creditAmount,
        line_order: line.lineOrder
      }));

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(entryLines);

      if (linesError) {
        // Rollback journal entry if lines creation fails
        await supabase
          .from('journal_entries')
          .delete()
          .eq('id', journalEntry.id);
        throw new Error(`Error creating journal entry lines: ${linesError.message}`);
      }

      return {
        id: journalEntry.id,
        userId: journalEntry.user_id,
        entryNumber: journalEntry.entry_number,
        entryDate: journalEntry.entry_date,
        description: journalEntry.description,
        referenceType: journalEntry.reference_type || 'payment',
        referenceId: journalEntry.reference_id || paymentId,
        status: journalEntry.status,
        lines: lines
      };
    } catch (error) {
      console.error('Error creating payment journal entry:', error);
      throw error;
    }
  }
}

export const accountingJournalService = new AccountingJournalService();

