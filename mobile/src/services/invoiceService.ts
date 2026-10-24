import type { CreateShareInvoiceRequest } from '@ledgercraft/contracts';
import {
  invoicesApi,
  invoicesApiEnabled,
  type MobileSharedInvoiceSnapshot,
  type MobileShareInvoiceResponse,
} from '@/features/invoices/api/invoicesApi';
import { supabase } from './supabaseClient';
import type { Invoice, LineItem, Customer } from '@/types/invoice';

export class InvoiceService {
  async createShareLink(
    invoiceId: string,
    templateName = 'classic',
    options: Pick<CreateShareInvoiceRequest, 'replace' | 'expiresAt'> = {},
  ): Promise<MobileShareInvoiceResponse> {
    return invoicesApi.share(invoiceId, templateName, options);
  }

  async listShareLinks(invoiceId: string) { return invoicesApi.listShares(invoiceId); }
  async revokeShareLinks(invoiceId: string) { return invoicesApi.revokeShares(invoiceId); }

  async fetchSharedInvoice(token: string): Promise<MobileSharedInvoiceSnapshot | 'inactive' | null> {
    return invoicesApi.getShared(token);
  }

  // Fetch all invoices for the current user
  async fetchInvoices(): Promise<Invoice[]> {
    try {
      if (invoicesApiEnabled()) {
        return invoicesApi.list();
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          customers (
            id,
            name,
            email,
            phone,
            address,
            city,
            state,
            zip,
            country
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform snake_case to camelCase
      return (data || []).map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        customerId: inv.customer_id,
        customer: inv.customers,
        date: inv.date,
        dueDate: inv.due_date,
        items: [], // Will be fetched separately
        subtotal: inv.subtotal,
        taxAmount: inv.tax_amount,
        discount: inv.discount,
        additionalCharges: inv.additional_charges,
        additionalChargesList: inv.additional_charges_list,
        additionalChargesTotal: inv.additional_charges_total,
        total: inv.total,
        status: inv.status,
        notes: inv.notes,
        terms: inv.terms,
        currency: inv.currency,
        templateName: inv.template_name,
        userId: inv.user_id,
        createdAt: inv.created_at,
        updatedAt: inv.updated_at,
      }));
    } catch (error) {
      console.error('Error fetching invoices:', error);
      throw error;
    }
  }

  // Fetch a single invoice by ID
  async fetchInvoiceById(id: string): Promise<Invoice> {
    try {
      if (invoicesApiEnabled()) {
        return invoicesApi.get(id);
      }

      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          customers (
            id,
            name,
            email,
            phone,
            address,
            city,
            state,
            zip,
            country
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Invoice not found');

      // Fetch line items
      const { data: lineItems, error: lineItemsError } = await supabase
        .from('line_items')
        .select('*')
        .eq('invoice_id', id);

      if (lineItemsError) throw lineItemsError;

      // Transform to camelCase
      return {
        id: data.id,
        invoiceNumber: data.invoice_number,
        customerId: data.customer_id,
        customer: data.customers,
        date: data.date,
        dueDate: data.due_date,
        items: (lineItems || []).map((item: any) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          total: item.total,
          tax: item.tax,
        })),
        subtotal: data.subtotal,
        taxAmount: data.tax_amount,
        discount: data.discount,
        additionalCharges: data.additional_charges,
        additionalChargesList: data.additional_charges_list,
        additionalChargesTotal: data.additional_charges_total,
        total: data.total,
        status: data.status,
        notes: data.notes,
        terms: data.terms,
        currency: data.currency,
        templateName: data.template_name,
        userId: data.user_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error('Error fetching invoice:', error);
      throw error;
    }
  }

  // Create a new invoice
  async createInvoice(
    invoiceData: Partial<Invoice>,
    lineItems: LineItem[]
  ): Promise<Invoice> {
    try {
      if (invoicesApiEnabled()) {
        return invoicesApi.create(invoiceData, lineItems);
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Transform to snake_case for database
      const dbInvoiceData = {
        invoice_number: invoiceData.invoiceNumber,
        customer_id: invoiceData.customerId,
        date: invoiceData.date,
        due_date: invoiceData.dueDate,
        subtotal: invoiceData.subtotal,
        tax_amount: invoiceData.taxAmount,
        discount: invoiceData.discount || 0,
        additional_charges: invoiceData.additionalCharges || 0,
        additional_charges_list: invoiceData.additionalChargesList || [],
        additional_charges_total: invoiceData.additionalChargesTotal || 0,
        total: invoiceData.total,
        status: invoiceData.status || 'draft',
        notes: invoiceData.notes || null,
        terms: invoiceData.terms || null,
        currency: invoiceData.currency || 'NZD',
        template_name: invoiceData.templateName || 'classic',
        user_id: user.id,
      };

      // Insert invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert(dbInvoiceData)
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Insert line items
      const dbLineItems = lineItems.map((item) => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        total: item.total,
        tax: item.tax || 0,
      }));

      const { error: lineItemsError } = await supabase
        .from('line_items')
        .insert(dbLineItems);

      if (lineItemsError) throw lineItemsError;

      return await this.fetchInvoiceById(invoice.id);
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw error;
    }
  }

  // Update an existing invoice
  async updateInvoice(
    id: string,
    invoiceData: Partial<Invoice>,
    lineItems: LineItem[]
  ): Promise<Invoice> {
    try {
      if (invoicesApiEnabled()) {
        return invoicesApi.update(id, invoiceData, lineItems);
      }

      // Transform to snake_case for database
      const dbInvoiceData = {
        invoice_number: invoiceData.invoiceNumber,
        customer_id: invoiceData.customerId,
        date: invoiceData.date,
        due_date: invoiceData.dueDate,
        subtotal: invoiceData.subtotal,
        tax_amount: invoiceData.taxAmount,
        discount: invoiceData.discount || 0,
        additional_charges: invoiceData.additionalCharges || 0,
        additional_charges_list: invoiceData.additionalChargesList || [],
        additional_charges_total: invoiceData.additionalChargesTotal || 0,
        total: invoiceData.total,
        status: invoiceData.status || 'draft',
        notes: invoiceData.notes || null,
        terms: invoiceData.terms || null,
        currency: invoiceData.currency || 'NZD',
        template_name: invoiceData.templateName || 'classic',
        updated_at: new Date().toISOString(),
      };

      // Update invoice
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update(dbInvoiceData)
        .eq('id', id);

      if (invoiceError) throw invoiceError;

      // Delete existing line items
      const { error: deleteError } = await supabase
        .from('line_items')
        .delete()
        .eq('invoice_id', id);

      if (deleteError) throw deleteError;

      // Insert new line items
      const dbLineItems = lineItems.map((item) => ({
        invoice_id: id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        total: item.total,
        tax: item.tax || 0,
      }));

      const { error: lineItemsError } = await supabase
        .from('line_items')
        .insert(dbLineItems);

      if (lineItemsError) throw lineItemsError;

      return await this.fetchInvoiceById(id);
    } catch (error) {
      console.error('Error updating invoice:', error);
      throw error;
    }
  }

  // Fetch all customers
  async fetchCustomers(): Promise<Customer[]> {
    try {
      if (invoicesApiEnabled()) {
        return invoicesApi.customers();
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;

      return (data || []).map((customer: any) => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zip: customer.zip,
        country: customer.country,
      }));
    } catch (error) {
      console.error('Error fetching customers:', error);
      throw error;
    }
  }

  // Generate next invoice number (matches web app logic)
  async generateInvoiceNumber(): Promise<string> {
    try {
      if (invoicesApiEnabled()) {
        return invoicesApi.nextNumber();
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get business profile for invoice number format
      const { data: profile, error: profileError } = await supabase
        .from('business_profiles')
        .select('invoice_number_format, invoice_number_sequence')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching business profile:', profileError);
      }

      // Default format if not set
      const format = profile?.invoice_number_format || 'INV-{YYYY}-{MM}-{SEQ}';

      // Fetch the latest invoice for this user
      const { data: lastInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('invoice_number, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invoiceError) {
        console.error('Error fetching last invoice:', invoiceError);
      }

      // Extract last sequence
      let lastSeq = 0;
      if (lastInvoice && lastInvoice.invoice_number) {
        // Try to extract the last sequence from the invoice number
        const match = lastInvoice.invoice_number.match(/(\d{3,})$/);
        if (match) {
          lastSeq = parseInt(match[1], 10);
        } else {
          // If no sequence found in format, use the stored sequence
          lastSeq = profile?.invoice_number_sequence || 0;
        }
      } else {
        lastSeq = profile?.invoice_number_sequence || 0;
      }
      
      const nextSeq = lastSeq + 1;

      // Format the new invoice number
      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const seq = String(nextSeq).padStart(4, '0');
      
      let invoiceNumber = format
        .replace('{YYYY}', year.toString())
        .replace('{MM}', month)
        .replace('{SEQ}', seq);

      // Update the business profile's sequence (if profile exists)
      if (profile) {
        await supabase
          .from('business_profiles')
          .update({ invoice_number_sequence: nextSeq })
          .eq('user_id', user.id);
      }

      return invoiceNumber;
    } catch (error) {
      console.error('Error generating invoice number:', error);
      // Fallback to simple format
      return `INV-${new Date().getFullYear()}-0001`;
    }
  }

  // Update invoice status only
  async updateInvoiceStatus(
    id: string,
    status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  ): Promise<void> {
    try {
      if (invoicesApiEnabled()) {
        if (status === 'cancelled') await invoicesApi.cancel(id);
        else await invoicesApi.updateStatus(id, status);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('invoices')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating invoice status:', error);
      throw error;
    }
  }

  async restoreInvoice(id: string): Promise<Invoice> { return invoicesApi.restore(id); }
  async archiveInvoice(id: string): Promise<Invoice> { return invoicesApi.archive(id); }
  async duplicateInvoice(id: string): Promise<Invoice> { return invoicesApi.duplicate(id); }
  async getInvoiceHistory(id: string) { return invoicesApi.history(id); }
  async getInvoiceAttachments(id: string) { return invoicesApi.attachments(id); }
  async attachInvoiceFile(id: string, input: { objectKey: string; filename: string }) { return invoicesApi.attach(id, input); }
}

export const invoiceService = new InvoiceService();

