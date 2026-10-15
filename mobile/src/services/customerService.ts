import { customersApi, customersApiEnabled } from '../features/customers/api/customersApi';
import { supabase } from './supabaseClient';

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  isVip?: boolean | null;
  tags?: string[] | null;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

function fromDto(customer: {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  isVip?: boolean | null;
  tags?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
}): Customer {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    state: customer.state,
    zip: customer.zip,
    country: customer.country,
    isVip: customer.isVip,
    tags: customer.tags,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export class CustomerService {
  async fetchCustomers(): Promise<Customer[]> {
    try {
      if (customersApiEnabled()) {
        return (await customersApi.list()).map(fromDto);
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

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
        isVip: customer.is_vip,
        tags: customer.tags,
        userId: customer.user_id,
        createdAt: customer.created_at,
        updatedAt: customer.updated_at,
      }));
    } catch (error) {
      console.error('Error fetching customers:', error);
      throw error;
    }
  }

  async fetchCustomerById(id: string): Promise<Customer> {
    try {
      if (customersApiEnabled()) {
        return fromDto(await customersApi.get(id));
      }

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Customer not found');

      return {
        id: data.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        country: data.country,
        isVip: data.is_vip,
        tags: data.tags,
        userId: data.user_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error('Error fetching customer:', error);
      throw error;
    }
  }

  async createCustomer(customerData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'userId'>): Promise<Customer> {
    try {
      if (customersApiEnabled()) {
        return fromDto(
          await customersApi.create({
            name: customerData.name,
            email: customerData.email || '',
            phone: customerData.phone || null,
            address: customerData.address || null,
            city: customerData.city || null,
            state: customerData.state || null,
            zip: customerData.zip || null,
            country: customerData.country || 'NZ',
            isVip: customerData.isVip || false,
            tags: customerData.tags || [],
          }),
        );
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('User not authenticated');
      }

      const dbCustomerData = {
        name: customerData.name,
        email: customerData.email || null,
        phone: customerData.phone || null,
        address: customerData.address || null,
        city: customerData.city || null,
        state: customerData.state || null,
        zip: customerData.zip || null,
        country: customerData.country || 'New Zealand',
        is_vip: customerData.isVip || false,
        tags: customerData.tags || [],
        user_id: user.id,
      };

      const { data, error } = await supabase
        .from('customers')
        .insert(dbCustomerData)
        .select()
        .single();

      if (error) throw error;

      return await this.fetchCustomerById(data.id);
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  async updateCustomer(id: string, customerData: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>): Promise<Customer> {
    try {
      if (customersApiEnabled()) {
        const input: Record<string, unknown> = {};
        if (customerData.name !== undefined) input.name = customerData.name;
        if (customerData.email !== undefined) input.email = customerData.email || '';
        if (customerData.phone !== undefined) input.phone = customerData.phone || null;
        if (customerData.address !== undefined) input.address = customerData.address || null;
        if (customerData.city !== undefined) input.city = customerData.city || null;
        if (customerData.state !== undefined) input.state = customerData.state || null;
        if (customerData.zip !== undefined) input.zip = customerData.zip || null;
        if (customerData.country !== undefined) input.country = customerData.country;
        if (customerData.isVip !== undefined) input.isVip = customerData.isVip;
        if (customerData.tags !== undefined) input.tags = customerData.tags;
        return fromDto(await customersApi.update(id, input));
      }

      const dbCustomerData: any = {};

      if (customerData.name !== undefined) dbCustomerData.name = customerData.name;
      if (customerData.email !== undefined) dbCustomerData.email = customerData.email || null;
      if (customerData.phone !== undefined) dbCustomerData.phone = customerData.phone || null;
      if (customerData.address !== undefined) dbCustomerData.address = customerData.address || null;
      if (customerData.city !== undefined) dbCustomerData.city = customerData.city || null;
      if (customerData.state !== undefined) dbCustomerData.state = customerData.state || null;
      if (customerData.zip !== undefined) dbCustomerData.zip = customerData.zip || null;
      if (customerData.country !== undefined) dbCustomerData.country = customerData.country;
      if (customerData.isVip !== undefined) dbCustomerData.is_vip = customerData.isVip;
      if (customerData.tags !== undefined) dbCustomerData.tags = customerData.tags;

      dbCustomerData.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('customers')
        .update(dbCustomerData)
        .eq('id', id);

      if (error) throw error;

      return await this.fetchCustomerById(id);
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  }

  async deleteCustomer(id: string): Promise<void> {
    try {
      if (customersApiEnabled()) {
        await customersApi.remove(id);
        return;
      }

      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting customer:', error);
      throw error;
    }
  }

  async fetchCustomerInvoices(customerId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        date: inv.date,
        dueDate: inv.due_date,
        total: inv.total,
        status: inv.status,
        createdAt: inv.created_at,
      }));
    } catch (error) {
      console.error('Error fetching customer invoices:', error);
      throw error;
    }
  }

  async getCustomerStats(customerId: string): Promise<{
    totalInvoices: number;
    totalBilled: number;
    totalPaid: number;
    outstanding: number;
  }> {
    try {
      const invoices = await this.fetchCustomerInvoices(customerId);

      const totalInvoices = invoices.length;
      const totalBilled = invoices.reduce((sum, inv) => sum + inv.total, 0);
      const totalPaid = invoices
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.total, 0);
      const outstanding = totalBilled - totalPaid;

      return {
        totalInvoices,
        totalBilled,
        totalPaid,
        outstanding,
      };
    } catch (error) {
      console.error('Error fetching customer stats:', error);
      return {
        totalInvoices: 0,
        totalBilled: 0,
        totalPaid: 0,
        outstanding: 0,
      };
    }
  }
}

export const customerService = new CustomerService();
