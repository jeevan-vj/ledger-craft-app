import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { 
  TaxConfiguration, 
  TaxReturn, 
  EnhancedInvoice, 
  Payment, 
  IRDReturnData 
} from '@/types/payment';
import { taxApi, taxApiEnabled } from '@/features/tax/api/taxApi';
import { summarizeGst } from '@/features/tax/api/periodRows';
import { accountsApi, accountsApiEnabled } from '@/features/payments/api/paymentsApi';
import { journalsApi, journalsApiEnabled } from '@/features/journals/api/journalsApi';
import { businessProfileApi, businessProfileApiEnabled } from '@/features/business-profile/api/businessProfileApi';

export class SupabaseDataService {
  /**
   * Tax Configuration Management
   */
  async getTaxConfiguration(userId: string, countryCode: string = 'NZ'): Promise<TaxConfiguration | null> {
    if (taxApiEnabled()) {
      return taxApi.getConfiguration(countryCode);
    }
    const { data, error } = await supabase
      .from('tax_configurations')
      .select('*')
      .eq('user_id', userId)
      .eq('country_code', countryCode)
      .eq('is_active', true)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching tax configuration:', error);
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      countryCode: data.country_code,
      taxType: data.tax_type,
      taxRate: data.tax_rate,
      taxName: data.tax_name,
      appliesToServices: data.applies_to_services,
      appliesToGoods: data.applies_to_goods,
      effectiveFrom: data.effective_from,
      effectiveTo: data.effective_to,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async createTaxConfiguration(config: Omit<TaxConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaxConfiguration> {
    if (taxApiEnabled()) {
      return taxApi.upsertConfiguration({
        countryCode: config.countryCode,
        taxType: config.taxType,
        taxRate: String(config.taxRate),
        taxName: config.taxName,
        appliesToServices: config.appliesToServices,
        appliesToGoods: config.appliesToGoods,
        effectiveFrom: config.effectiveFrom,
        effectiveTo: config.effectiveTo ?? null,
        isActive: config.isActive,
      });
    }
    const { data, error } = await supabase
      .from('tax_configurations')
      .insert({
        user_id: config.userId,
        country_code: config.countryCode,
        tax_type: config.taxType,
        tax_rate: config.taxRate,
        tax_name: config.taxName,
        applies_to_services: config.appliesToServices,
        applies_to_goods: config.appliesToGoods,
        effective_from: config.effectiveFrom,
        effective_to: config.effectiveTo,
        is_active: config.isActive
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating tax configuration: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      countryCode: data.country_code,
      taxType: data.tax_type,
      taxRate: data.tax_rate,
      taxName: data.tax_name,
      appliesToServices: data.applies_to_services,
      appliesToGoods: data.applies_to_goods,
      effectiveFrom: data.effective_from,
      effectiveTo: data.effective_to,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  /**
   * Invoice Data Management
   */
  async getInvoicesByPeriod(
    userId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<EnhancedInvoice[]> {
    if (taxApiEnabled()) {
      return taxApi.invoicesByPeriod(periodStart, periodEnd);
    }
    const { data: invoicesData, error: invoicesError } = await supabase
      .from('invoices')
      .select(`
        *,
        customers(*),
        line_items(*)
      `)
      .eq('user_id', userId)
      .gte('date', periodStart)
      .lte('date', periodEnd)
      .order('date', { ascending: false });

    if (invoicesError) {
      throw new Error(`Error fetching invoices: ${invoicesError.message}`);
    }

    return invoicesData.map(invoice => ({
      ...invoice,
      taxInclusive: invoice.tax_inclusive ?? true,
      paymentStatus: invoice.payment_status as 'unpaid' | 'partial' | 'paid' | 'overdue' | 'written_off',
      balanceDue: invoice.balance_due ?? invoice.total,
      taxBreakdown: invoice.tax_breakdown,
      lineItems: invoice.line_items?.map(item => ({
        ...item,
        taxInclusive: item.tax_inclusive ?? true,
        taxable: item.taxable ?? true
      })) || []
    }));
  }

  async updateInvoiceTaxData(
    invoiceId: string,
    taxData: {
      taxAmount: number;
      taxRate?: number;
      taxInclusive?: boolean;
      taxBreakdown?: any;
      balanceDue?: number;
    }
  ): Promise<void> {
    const { error } = await supabase
      .from('invoices')
      .update({
        tax_amount: taxData.taxAmount,
        tax_rate: taxData.taxRate,
        tax_inclusive: taxData.taxInclusive,
        tax_breakdown: taxData.taxBreakdown,
        balance_due: taxData.balanceDue
      })
      .eq('id', invoiceId);

    if (error) {
      throw new Error(`Error updating invoice tax data: ${error.message}`);
    }
  }

  /**
   * Expense Data Management
   */
  async getExpensesByPeriod(
    userId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<any[]> {
    if (taxApiEnabled()) {
      return taxApi.expensesByPeriod(periodStart, periodEnd);
    }
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .gte('expense_date', periodStart)
      .lte('expense_date', periodEnd)
      .order('expense_date', { ascending: false });

    if (error) {
      throw new Error(`Error fetching expenses: ${error.message}`);
    }

    return data || [];
  }

  async createExpense(expense: TablesInsert<'expenses'>): Promise<Tables<'expenses'>> {
    const { data, error } = await supabase
      .from('expenses')
      .insert(expense)
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating expense: ${error.message}`);
    }

    return data;
  }

  async updateExpense(
    expenseId: string,
    updates: TablesUpdate<'expenses'>
  ): Promise<Tables<'expenses'>> {
    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', expenseId)
      .select()
      .single();

    if (error) {
      throw new Error(`Error updating expense: ${error.message}`);
    }

    return data;
  }

  /**
   * Payment Data Management
   */
  async getPaymentsByPeriod(
    userId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<Payment[]> {
    if (taxApiEnabled()) {
      return taxApi.paymentsByPeriod(periodStart, periodEnd);
    }
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .gte('payment_date', periodStart)
      .lte('payment_date', periodEnd)
      .order('payment_date', { ascending: false });

    if (error) {
      throw new Error(`Error fetching payments: ${error.message}`);
    }

    return (data || []).map(payment => ({
      id: payment.id,
      userId: payment.user_id,
      invoiceId: payment.invoice_id,
      amount: payment.amount,
      paymentDate: payment.payment_date,
      paymentMethod: payment.payment_method,
      referenceNumber: payment.reference_number,
      status: payment.status as 'pending' | 'completed' | 'failed' | 'cancelled',
      createdAt: payment.created_at,
      updatedAt: payment.updated_at
    }));
  }

  async createPayment(payment: TablesInsert<'payments'>): Promise<Payment> {
    const { data, error } = await supabase
      .from('payments')
      .insert(payment)
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating payment: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      invoiceId: data.invoice_id,
      amount: data.amount,
      paymentDate: data.payment_date,
      paymentMethod: data.payment_method,
      referenceNumber: data.reference_number,
      status: data.status as 'pending' | 'completed' | 'failed' | 'cancelled',
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  /**
   * Tax Return Management
   */
  async createTaxReturn(taxReturn: Omit<TaxReturn, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaxReturn> {
    if (taxApiEnabled()) {
      return taxApi.createReturn({
        periodStart: taxReturn.periodStart,
        periodEnd: taxReturn.periodEnd,
        returnType: taxReturn.returnType,
        totalSales: String(taxReturn.totalSales),
        totalPurchases: String(taxReturn.totalPurchases),
        gstOnSales: String(taxReturn.gstOnSales),
        gstOnPurchases: String(taxReturn.gstOnPurchases),
        netGst: String(taxReturn.netGst),
        status: taxReturn.status,
        irdReference: taxReturn.irdReference ?? null,
        returnData: taxReturn.returnData ?? null,
      });
    }
    const { data, error } = await supabase
      .from('tax_returns')
      .insert({
        user_id: taxReturn.userId,
        period_start: taxReturn.periodStart,
        period_end: taxReturn.periodEnd,
        return_type: taxReturn.returnType,
        total_sales: taxReturn.totalSales,
        total_purchases: taxReturn.totalPurchases,
        gst_on_sales: taxReturn.gstOnSales,
        gst_on_purchases: taxReturn.gstOnPurchases,
        net_gst: taxReturn.netGst,
        status: taxReturn.status,
        ird_reference: taxReturn.irdReference,
        submitted_at: taxReturn.submittedAt,
        return_data: taxReturn.returnData
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating tax return: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      returnType: data.return_type as 'GST' | 'Income_Tax' | 'FBT' | 'PAYE',
      totalSales: data.total_sales,
      totalPurchases: data.total_purchases,
      gstOnSales: data.gst_on_sales,
      gstOnPurchases: data.gst_on_purchases,
      netGst: data.net_gst,
      status: data.status as 'draft' | 'submitted' | 'approved' | 'rejected',
      irdReference: data.ird_reference,
      submittedAt: data.submitted_at,
      returnData: data.return_data,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async getTaxReturnsByUser(
    userId: string,
    returnType?: TaxReturn['returnType'],
    limit: number = 50,
    offset: number = 0
  ): Promise<TaxReturn[]> {
    if (taxApiEnabled()) {
      const rows = await taxApi.listReturns();
      const filtered = returnType ? rows.filter((row) => row.returnType === returnType) : rows;
      return filtered.slice(offset, offset + limit);
    }
    let query = supabase
      .from('tax_returns')
      .select('*')
      .eq('user_id', userId);

    if (returnType) {
      query = query.eq('return_type', returnType);
    }

    const { data, error } = await query
      .order('period_end', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Error fetching tax returns: ${error.message}`);
    }

    return (data || []).map(taxReturn => ({
      id: taxReturn.id,
      userId: taxReturn.user_id,
      periodStart: taxReturn.period_start,
      periodEnd: taxReturn.period_end,
      returnType: taxReturn.return_type as 'GST' | 'Income_Tax' | 'FBT' | 'PAYE',
      totalSales: taxReturn.total_sales,
      totalPurchases: taxReturn.total_purchases,
      gstOnSales: taxReturn.gst_on_sales,
      gstOnPurchases: taxReturn.gst_on_purchases,
      netGst: taxReturn.net_gst,
      status: taxReturn.status as 'draft' | 'submitted' | 'approved' | 'rejected',
      irdReference: taxReturn.ird_reference,
      submittedAt: taxReturn.submitted_at,
      returnData: taxReturn.return_data,
      createdAt: taxReturn.created_at,
      updatedAt: taxReturn.updated_at
    }));
  }

  async getTaxReturnById(taxReturnId: string): Promise<TaxReturn | null> {
    if (taxApiEnabled()) {
      return taxApi.getReturn(taxReturnId);
    }
    const { data, error } = await supabase
      .from('tax_returns')
      .select('*')
      .eq('id', taxReturnId)
      .single();

    if (error) {
      console.error('Error fetching tax return:', error);
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      returnType: data.return_type as 'GST' | 'Income_Tax' | 'FBT' | 'PAYE',
      totalSales: data.total_sales,
      totalPurchases: data.total_purchases,
      gstOnSales: data.gst_on_sales,
      gstOnPurchases: data.gst_on_purchases,
      netGst: data.net_gst,
      status: data.status as 'draft' | 'submitted' | 'approved' | 'rejected',
      irdReference: data.ird_reference,
      submittedAt: data.submitted_at,
      returnData: data.return_data,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async updateTaxReturn(
    taxReturnId: string,
    updates: Partial<TaxReturn>
  ): Promise<TaxReturn> {
    if (taxApiEnabled()) {
      if (updates.status && updates.status !== 'draft') {
        throw new Error('Use fileTaxReturn to record a filed GST return');
      }
      return taxApi.updateReturn(taxReturnId, {
        periodStart: updates.periodStart,
        periodEnd: updates.periodEnd,
        returnType: updates.returnType,
        totalSales: updates.totalSales == null ? undefined : String(updates.totalSales),
        totalPurchases: updates.totalPurchases == null ? undefined : String(updates.totalPurchases),
        gstOnSales: updates.gstOnSales == null ? undefined : String(updates.gstOnSales),
        gstOnPurchases: updates.gstOnPurchases == null ? undefined : String(updates.gstOnPurchases),
        netGst: updates.netGst == null ? undefined : String(updates.netGst),
        status: updates.status === 'draft' ? 'draft' : undefined,
        irdReference: updates.irdReference ?? undefined,
        returnData: updates.returnData,
      });
    }
    const updateData: TablesUpdate<'tax_returns'> = {};
    
    if (updates.status) updateData.status = updates.status;
    if (updates.irdReference) updateData.ird_reference = updates.irdReference;
    if (updates.submittedAt) updateData.submitted_at = updates.submittedAt;
    if (updates.returnData) updateData.return_data = updates.returnData;
    if (updates.totalSales !== undefined) updateData.total_sales = updates.totalSales;
    if (updates.totalPurchases !== undefined) updateData.total_purchases = updates.totalPurchases;
    if (updates.gstOnSales !== undefined) updateData.gst_on_sales = updates.gstOnSales;
    if (updates.gstOnPurchases !== undefined) updateData.gst_on_purchases = updates.gstOnPurchases;
    if (updates.netGst !== undefined) updateData.net_gst = updates.netGst;

    const { data, error } = await supabase
      .from('tax_returns')
      .update(updateData)
      .eq('id', taxReturnId)
      .select()
      .single();

    if (error) {
      throw new Error(`Error updating tax return: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      returnType: data.return_type as 'GST' | 'Income_Tax' | 'FBT' | 'PAYE',
      totalSales: data.total_sales,
      totalPurchases: data.total_purchases,
      gstOnSales: data.gst_on_sales,
      gstOnPurchases: data.gst_on_purchases,
      netGst: data.net_gst,
      status: data.status as 'draft' | 'submitted' | 'approved' | 'rejected',
      irdReference: data.ird_reference,
      submittedAt: data.submitted_at,
      returnData: data.return_data,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async fileTaxReturn(taxReturnId: string, irdReference: string): Promise<TaxReturn> {
    if (taxApiEnabled()) {
      return taxApi.fileReturn(taxReturnId, { irdReference });
    }
    return this.updateTaxReturn(taxReturnId, {
      status: 'submitted',
      submittedAt: new Date().toISOString(),
      irdReference,
    });
  }

  async deleteTaxReturn(taxReturnId: string): Promise<void> {
    if (taxApiEnabled()) {
      await taxApi.removeReturn(taxReturnId);
      return;
    }
    const { error } = await supabase
      .from('tax_returns')
      .delete()
      .eq('id', taxReturnId);

    if (error) {
      throw new Error(`Error deleting tax return: ${error.message}`);
    }
  }

  /**
   * Utility Functions
   */
  async getUserBusinessProfile(userId: string): Promise<Tables<'business_profiles'> | null> {
    if (businessProfileApiEnabled()) {
      const profile = await businessProfileApi.get();
      if (!profile) return null;
      return {
        id: profile.id,
        user_id: userId,
        name: profile.name,
        email: profile.email,
        country: profile.country,
      } as Tables<'business_profiles'>;
    }
    const { data, error } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching business profile:', error);
      return null;
    }

    return data;
  }

  async createDefaultTaxConfiguration(userId: string): Promise<TaxConfiguration> {
    if (taxApiEnabled()) {
      return taxApi.getConfiguration('NZ');
    }
    const businessProfile = await this.getUserBusinessProfile(userId);
    
    // Map country name to ISO 2-letter code (VARCHAR(2) constraint in database)
    const countryNameToCode: Record<string, string> = {
      'New Zealand': 'NZ',
      'Australia': 'AU',
      'United States': 'US',
      'United Kingdom': 'GB',
      'Canada': 'CA',
      'Germany': 'DE',
      'France': 'FR',
      'Japan': 'JP',
      'Singapore': 'SG',
      'India': 'IN',
    };
    
    const rawCountry = businessProfile?.country || 'NZ';
    // If already a 2-letter code, use it; otherwise map from name
    const countryCode = rawCountry.length === 2 
      ? rawCountry.toUpperCase() 
      : (countryNameToCode[rawCountry] || 'NZ');
    
    // Default to NZ GST configuration
    const defaultConfig = {
      userId,
      countryCode,
      taxType: 'GST' as const,
      taxRate: 0.15,
      taxName: 'GST',
      appliesToServices: true,
      appliesToGoods: true,
      effectiveFrom: new Date().toISOString().split('T')[0],
      effectiveTo: null,
      isActive: true
    };

    return this.createTaxConfiguration(defaultConfig);
  }

  /**
   * Journal Entry Management
   */
  async getJournalEntries(
    userId: string,
    limit: number = 50,
    offset: number = 0,
    statusFilter?: string,
    periodStart?: string,
    periodEnd?: string
  ): Promise<any[]> {
    if (journalsApiEnabled()) {
      const entries = await journalsApi.list();
      return entries
        .filter((entry) => {
          if (statusFilter && statusFilter !== 'all' && entry.status !== statusFilter) return false;
          if (periodStart && entry.entryDate < periodStart) return false;
          if (periodEnd && entry.entryDate > periodEnd) return false;
          return true;
        })
        .slice(offset, offset + limit);
    }
    let query = supabase
      .from('journal_entries')
      .select(`
        *,
        journal_entry_lines (
          *,
          accounts (
            id,
            name,
            account_number,
            account_class
          )
        )
      `)
      .eq('user_id', userId);

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (periodStart) {
      query = query.gte('entry_date', periodStart);
    }

    if (periodEnd) {
      query = query.lte('entry_date', periodEnd);
    }

    const { data, error } = await query
      .order('entry_date', { ascending: false })
      .order('entry_number', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Error fetching journal entries: ${error.message}`);
    }

    // Transform the data to match the expected format
    return (data || []).map(entry => {
      const lines = entry.journal_entry_lines || [];
      const debitLine = lines.find((line: any) => line.debit_amount > 0);
      const creditLine = lines.find((line: any) => line.credit_amount > 0);

      return {
        id: entry.id,
        userId: entry.user_id,
        entryNumber: entry.entry_number,
        entryDate: entry.entry_date,
        description: entry.description,
        referenceNumber: entry.reference_type === 'manual' ? null : entry.reference_id,
        debitAccountId: debitLine?.account_id,
        debitAccountName: debitLine?.accounts?.name || 'Unknown Account',
        debitAmount: debitLine?.debit_amount || 0,
        creditAccountId: creditLine?.account_id,
        creditAccountName: creditLine?.accounts?.name || 'Unknown Account',
        creditAmount: creditLine?.credit_amount || 0,
        status: entry.status,
        notes: lines[0]?.description || null,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
        createdBy: entry.user_id
      };
    });
  }

  async createJournalEntry(
    userId: string,
    entryData: {
      description: string;
      entryDate: string;
      debitAccountId: string;
      creditAccountId: string;
      amount: number;
      referenceNumber?: string;
      notes?: string;
    }
  ): Promise<any> {
    if (journalsApiEnabled()) {
      return journalsApi.create({
        description: entryData.description,
        entryDate: entryData.entryDate,
        debitAccountId: entryData.debitAccountId,
        creditAccountId: entryData.creditAccountId,
        amount: String(entryData.amount),
        referenceNumber: entryData.referenceNumber,
        notes: entryData.notes,
      });
    }
    try {
      // Generate entry number
      const { data: existingEntries } = await supabase
        .from('journal_entries')
        .select('entry_number')
        .eq('user_id', userId)
        .order('entry_number', { ascending: false })
        .limit(1);

      const currentYear = new Date().getFullYear();
      const nextNumber = existingEntries && existingEntries.length > 0 
        ? parseInt(existingEntries[0].entry_number.split('-')[2]) + 1 
        : 1;
      const entryNumber = `JE-${currentYear}-${String(nextNumber).padStart(3, '0')}`;

      // Create journal entry
      const { data: journalEntry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          user_id: userId,
          entry_number: entryNumber,
          entry_date: entryData.entryDate,
          description: entryData.description,
          reference_type: entryData.referenceNumber ? 'manual' : 'manual',
          reference_id: entryData.referenceNumber,
          total_amount: entryData.amount,
          status: 'draft'
        })
        .select()
        .single();

      if (entryError) {
        throw new Error(`Error creating journal entry: ${entryError.message}`);
      }

      // Create journal entry lines
      const lines = [
        {
          journal_entry_id: journalEntry.id,
          account_id: entryData.debitAccountId,
          description: entryData.notes || entryData.description,
          debit_amount: entryData.amount,
          credit_amount: 0,
          line_order: 1
        },
        {
          journal_entry_id: journalEntry.id,
          account_id: entryData.creditAccountId,
          description: entryData.notes || entryData.description,
          debit_amount: 0,
          credit_amount: entryData.amount,
          line_order: 2
        }
      ];

      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(lines);

      if (linesError) {
        // Rollback journal entry if lines creation fails
        await supabase
          .from('journal_entries')
          .delete()
          .eq('id', journalEntry.id);
        throw new Error(`Error creating journal entry lines: ${linesError.message}`);
      }

      // Return the created entry in the expected format
      const [debitAccount, creditAccount] = await Promise.all([
        this.getAccountById(entryData.debitAccountId),
        this.getAccountById(entryData.creditAccountId)
      ]);

      return {
        id: journalEntry.id,
        userId: journalEntry.user_id,
        entryNumber: journalEntry.entry_number,
        entryDate: journalEntry.entry_date,
        description: journalEntry.description,
        referenceNumber: entryData.referenceNumber,
        debitAccountId: entryData.debitAccountId,
        debitAccountName: debitAccount?.name || 'Unknown Account',
        debitAmount: entryData.amount,
        creditAccountId: entryData.creditAccountId,
        creditAccountName: creditAccount?.name || 'Unknown Account',
        creditAmount: entryData.amount,
        status: journalEntry.status,
        notes: entryData.notes,
        createdAt: journalEntry.created_at,
        updatedAt: journalEntry.updated_at,
        createdBy: journalEntry.user_id
      };

    } catch (error) {
      console.error('Error in createJournalEntry:', error);
      throw error;
    }
  }

  async updateJournalEntryStatus(entryId: string, status: 'draft' | 'posted' | 'reversed'): Promise<void> {
    if (journalsApiEnabled()) {
      await journalsApi.update(entryId, { status });
      return;
    }
    const { error } = await supabase
      .from('journal_entries')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', entryId);

    if (error) {
      throw new Error(`Error updating journal entry status: ${error.message}`);
    }
  }

  async deleteJournalEntry(entryId: string): Promise<void> {
    if (journalsApiEnabled()) {
      await journalsApi.remove(entryId);
      return;
    }
    // First delete the lines (due to foreign key constraint)
    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .delete()
      .eq('journal_entry_id', entryId);

    if (linesError) {
      throw new Error(`Error deleting journal entry lines: ${linesError.message}`);
    }

    // Then delete the journal entry
    const { error: entryError } = await supabase
      .from('journal_entries')
      .delete()
      .eq('id', entryId);

    if (entryError) {
      throw new Error(`Error deleting journal entry: ${entryError.message}`);
    }
  }

  async getAccountById(accountId: string): Promise<{ id: string; name: string } | null> {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('id', accountId)
      .single();

    if (error) {
      console.error('Error fetching account:', error);
      return null;
    }

    return data;
  }

  async getAccounts(userId: string): Promise<any[]> {
    if (accountsApiEnabled()) {
      return (await accountsApi.list())
        .filter((account) => account.isActive !== false)
        .map((account) => ({
          id: account.id,
          name: account.name,
          number: account.accountNumber ?? null,
          type: account.accountClass || account.type,
          description: null,
        }));
    }
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('account_number');

    if (error) {
      throw new Error(`Error fetching accounts: ${error.message}`);
    }

    return (data || []).map(account => ({
      id: account.id,
      name: account.name,
      number: account.account_number,
      type: account.account_class || account.type,
      description: account.description
    }));
  }

  /**
   * Analytics and Reporting
   */
  async getGSTReturnSummary(
    userId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<{
    totalSales: number;
    totalPurchases: number;
    gstOnSales: number;
    gstOnPurchases: number;
    netGstPosition: number;
  }> {
    const [invoices, expenses] = await Promise.all([
      this.getInvoicesByPeriod(userId, periodStart, periodEnd),
      this.getExpensesByPeriod(userId, periodStart, periodEnd),
    ]);

    return summarizeGst(invoices, expenses);
  }
}

export const supabaseDataService = new SupabaseDataService();
