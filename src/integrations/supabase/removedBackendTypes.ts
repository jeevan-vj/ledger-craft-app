/** Historical row shapes, retained only to type the permanently removed backend. */
import type { Database } from './types';
import type { SupabaseBusinessProfile, SupabaseCustomer, SupabaseItem, SupabaseItemCategory, SupabaseLineItem, SupabaseAccount, SupabaseConversation, SupabaseConversationMessage, SupabaseExpense, SupabaseExpenseCategory, SupabaseInvoice, SupabaseSharedInvoice } from '@/types';
import type { SupabaseBankAccount, SupabaseBankTransaction } from '@/types/bankTransaction';
import type { SupabaseReconciliationSession, SupabaseReconciliationMatch, SupabaseReconciliationAdjustment } from '@/types/reconciliation';

type StoredTables = Database['public']['Tables'];
type StoredRows = { [Name in keyof StoredTables]: StoredTables[Name]['Row'] };

export type RemovedBackendRows = Omit<StoredRows, 'expenses' | 'invoices' | 'line_items' | 'business_profiles' | 'items' | 'payments'> & {
  accounts: SupabaseAccount & { account_number?: string; account_class?: string; description?: string; account_type?: string; normal_balance?: string };
  expenses: SupabaseExpense & Omit<StoredRows['expenses'], keyof SupabaseExpense> & { expense_categories?: SupabaseExpenseCategory };
  expense_categories: SupabaseExpenseCategory;
  invoices: Omit<SupabaseInvoice, 'customers'> & Omit<StoredRows['invoices'], keyof SupabaseInvoice> & { customers?: SupabaseCustomer; line_items?: SupabaseLineItem[]; tax_inclusive?: boolean; total_paid?: number; balance_due?: number; total_amount?: number; issue_date?: string; tax_breakdown?: import('@/types/payment').TaxBreakdown };
  line_items: SupabaseLineItem;
  business_profiles: SupabaseBusinessProfile;
  items: SupabaseItem & { item_categories?: SupabaseItemCategory };
  payments: Omit<StoredRows['payments'], 'payment_method'> & { notes?: string; payment_method: import('@/types/payment').Payment['paymentMethod']; invoices?: RemovedBackendRows['invoices'] };
  bank_accounts: SupabaseBankAccount;
  bank_transactions: SupabaseBankTransaction;
  reconciliation_sessions: SupabaseReconciliationSession;
  reconciliation_matches: SupabaseReconciliationMatch;
  reconciliation_adjustments: SupabaseReconciliationAdjustment;
  shared_invoices: SupabaseSharedInvoice;
  conversations: SupabaseConversation & { conversation_messages?: SupabaseConversationMessage[] };
  conversation_messages: SupabaseConversationMessage;
  account_templates: { id: string; name: string; account_number: string; account_class: string; account_type: string; normal_balance: string; description: string; country_code: string };
  journal_entries: { id: string; user_id: string; entry_number: string; entry_date: string; description: string; reference_type: string; reference_id: string; status: 'draft' | 'posted' | 'reversed'; total_amount: number; created_at: string; updated_at: string; journal_entry_lines?: RemovedBackendRows['journal_entry_lines'][] };
  journal_entry_lines: { id: string; journal_entry_id: string; account_id: string; description: string; debit_amount: number; credit_amount: number; line_order: number; accounts?: SupabaseAccount; journal_entries?: RemovedBackendRows['journal_entries'] };
  receipts: { id: string; payment_id: string; receipt_number: string; user_id: string; generated_at: string; email_sent_at: string; is_emailed: boolean; receipt_data: import('@/types/payment').ReceiptData; created_at: string };
};
