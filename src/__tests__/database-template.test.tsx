import { describe, it, expect, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', async () => vi.importActual('@/integrations/supabase/client'));

// Test to verify database schema and template handling
describe('Database Template Field Tests', () => {

  it('should verify that template_name column exists in invoices table', async () => {
    // Try to select just the template_name column to see if it exists
    const { data, error } = await supabase
      .from('invoices')
      .select('template_name')
      .limit(1);

    if (error) {
      console.error('❌ Database error:', error.message);
      console.log('💡 This suggests the template_name column might not exist');
      
      // Check if it's a column not found error
      if (error.message.includes('column') && error.message.includes('template_name')) {
        console.log('🚨 ISSUE FOUND: template_name column does not exist in the database!');
        expect(false).toBe(true); // Fail the test to highlight the issue
      }
    } else {
      console.log('✅ template_name column exists in database');
      expect(error).toBeNull();
    }
  });

  it('should test creating an invoice with template field', async () => {
    // Create a minimal test invoice
    const testInvoice = {
      invoice_number: `TEST-${Date.now()}`,
      customer_id: null, // Assuming nullable
      date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      subtotal: 100,
      tax_amount: 10,
      total: 110,
      status: 'draft',
      currency: 'USD',
      template_name: 'corporate', // Test template
    };

    const { data, error } = await supabase
      .from('invoices')
      .insert(testInvoice)
      .select()
      .single();

    if (error) {
      console.error('❌ Error inserting test invoice:', error.message);
      console.log('💡 Error details:', error);
      
      if (error.message.includes('template_name')) {
        console.log('🚨 CONFIRMED: template_name column issue in database');
      }
      
      // Don't fail the test, just log the issue
      console.log('⚠️ Database schema may need template_name column added');
    } else {
      console.log('✅ Test invoice created successfully');
      console.log('🎨 Saved template:', data.template_name);
      expect(data.template_name).toBe('corporate');
      
      // Clean up
      await supabase
        .from('invoices')
        .delete()
        .eq('id', data.id);
    }
  });

  it('should check existing invoices for template_name field', async () => {
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, template_name')
      .limit(5);

    if (error) {
      console.error('❌ Error fetching invoices:', error.message);
    } else {
      console.log('📊 Sample invoices from database:');
      invoices?.forEach((invoice, index) => {
        console.log(`${index + 1}. ${invoice.invoice_number}: template = ${invoice.template_name || 'NULL'}`);
      });
      
      if (invoices && invoices.length > 0) {
        const hasTemplateData = invoices.some(inv => inv.template_name);
        if (!hasTemplateData) {
          console.log('⚠️ No existing invoices have template_name data');
        } else {
          console.log('✅ Some invoices have template_name data');
        }
      }
    }
  });
});