import { supabase } from './supabase';
import { conversationsApi, conversationsApiEnabled } from '@/features/conversations/api/conversationsApi';
import { customerService, itemService, invoiceService } from './supabaseService';
import type { ConversationDto } from '@ledgercraft/contracts';

export type ConversationRole = 'user' | 'assistant' | 'system';

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: ConversationRole;
  content: string;
  metadata?: any;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title?: string;
  context: any;
  status: 'active' | 'completed' | 'paused';
  created_at: string;
  updated_at: string;
}

export interface InvoiceCreationContext {
  step: 'customer_search' | 'customer_disambiguation' | 'item_selection' | 'additional_charges' | 'template_selection' | 'invoice_creation';
  customer_search_term?: string;
  customer_candidates?: any[];
  selected_customer?: any;
  selected_items?: any[];
  additional_charges?: any[];
  selected_template?: string;
  invoice_data?: any;
}

class AIConversationService {
  private toConversation(dto: ConversationDto): Conversation {
    return {
      id: dto.id,
      user_id: '',
      title: dto.title ?? undefined,
      context: dto.context,
      status: dto.status,
      created_at: dto.createdAt,
      updated_at: dto.updatedAt,
    };
  }

  private toMessage(dto: ConversationDto['messages'][number], conversationId: string): ConversationMessage {
    return {
      id: dto.id,
      conversation_id: conversationId,
      role: dto.role,
      content: dto.content,
      metadata: dto.metadata,
      created_at: dto.createdAt,
    };
  }

  async createConversation(title?: string, context: any = {}): Promise<Conversation> {
    if (conversationsApiEnabled()) {
      return this.toConversation(await conversationsApi.create({ title, context }));
    }
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        title,
        context,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    if (conversationsApiEnabled()) {
      const dto = await conversationsApi.get(id);
      return dto ? this.toConversation(dto) : null;
    }
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  }

  async updateConversationContext(id: string, context: any): Promise<void> {
    if (conversationsApiEnabled()) {
      await conversationsApi.update(id, { context });
      return;
    }
    const { error } = await supabase
      .from('conversations')
      .update({ context, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  async addMessage(conversationId: string, role: ConversationRole, content: string, metadata?: any): Promise<ConversationMessage> {
    if (conversationsApiEnabled()) {
      const dto = await conversationsApi.addMessage(conversationId, { role, content, metadata });
      const last = dto.messages[dto.messages.length - 1];
      return this.toMessage(last, dto.id);
    }
    const { data, error } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        metadata
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    if (conversationsApiEnabled()) {
      const dto = await conversationsApi.get(conversationId);
      return dto ? dto.messages.map((message) => this.toMessage(message, dto.id)) : [];
    }
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async searchCustomers(searchTerm: string): Promise<any[]> {
    const needle = searchTerm.toLowerCase();
    return (await customerService.getCustomers())
      .filter((customer) => customer.name.toLowerCase().includes(needle))
      .slice(0, 10);
  }

  async searchItems(searchTerm?: string): Promise<any[]> {
    const needle = searchTerm?.toLowerCase();
    return (await itemService.getItems())
      .filter((item) => item.enableSaleInfo)
      .filter((item) =>
        !needle ||
        item.name.toLowerCase().includes(needle) ||
        (item.description ?? '').toLowerCase().includes(needle),
      )
      .slice(0, 20);
  }

  async generateInvoiceNumber(): Promise<string> {
    return invoiceService.getNextInvoiceNumber();
  }

  async createInvoice(invoiceData: any): Promise<any> {
    const invoiceNumber = await this.generateInvoiceNumber();
    const lineItems = (invoiceData.line_items ?? []).map((item: any) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit || 'each',
      rate: item.rate,
      rateUnit: item.unit || 'each',
      tax: item.tax || 0,
      total: item.total,
    }));
    return invoiceService.createInvoice(
      {
        invoiceNumber,
        customerId: invoiceData.customer_id,
        date: invoiceData.date || new Date().toISOString().split('T')[0],
        dueDate: invoiceData.due_date,
        items: lineItems,
        subtotal: invoiceData.subtotal,
        taxAmount: invoiceData.tax_amount || 0,
        discount: invoiceData.discount || 0,
        additionalCharges: invoiceData.additional_charges_total || 0,
        additionalChargesList: invoiceData.additional_charges_list,
        total: invoiceData.total,
        status: 'draft',
        notes: invoiceData.notes,
        terms: invoiceData.terms,
        currency: 'NZD',
        templateName: invoiceData.template_name || 'classic',
      },
      lineItems,
    );
  }

  async processInvoiceCreationRequest(userMessage: string, conversationId?: string): Promise<{
    response: string;
    conversationId: string;
    context: InvoiceCreationContext;
    action?: 'search_customers' | 'show_customers' | 'suggest_items' | 'create_invoice';
    data?: any;
  }> {
    let conversation: Conversation;
    
    if (conversationId) {
      conversation = await this.getConversation(conversationId) as Conversation;
    } else {
      conversation = await this.createConversation('Invoice Creation', {
        step: 'customer_search',
        invoice_type: 'create'
      } as InvoiceCreationContext);
    }

    await this.addMessage(conversation.id, 'user', userMessage);

    const context = conversation.context as InvoiceCreationContext;
    
    // Parse user intent and extract customer name
    const customerNameMatch = userMessage.match(/(?:invoice|bill|create).*?for\s+([A-Za-z\s]+)/i);
    const customerName = customerNameMatch ? customerNameMatch[1].trim() : null;

    if (customerName && context.step === 'customer_search') {
      const customers = await this.searchCustomers(customerName);
      
      if (customers.length === 0) {
        const response = `I couldn't find any customers named "${customerName}". Would you like to create a new customer or search for a different name?`;
        await this.addMessage(conversation.id, 'assistant', response);
        return {
          response,
          conversationId: conversation.id,
          context,
          action: 'search_customers'
        };
      } else if (customers.length === 1) {
        const customer = customers[0];
        const newContext: InvoiceCreationContext = {
          ...context,
          step: 'item_selection',
          selected_customer: customer
        };
        
        await this.updateConversationContext(conversation.id, newContext);
        
        const items = await this.searchItems();
        const response = `Great! I found ${customer.name}. Now let's add some items to the invoice. Here are some available items:\n\n${items.slice(0, 5).map((item, index) => `${index + 1}. ${item.name} - $${item.sale_price} (${item.description || 'No description'})`).join('\n')}\n\nYou can select items by number or tell me what items you'd like to add.`;
        
        await this.addMessage(conversation.id, 'assistant', response);
        return {
          response,
          conversationId: conversation.id,
          context: newContext,
          action: 'suggest_items',
          data: { customer, items }
        };
      } else {
        const newContext: InvoiceCreationContext = {
          ...context,
          step: 'customer_disambiguation',
          customer_search_term: customerName,
          customer_candidates: customers
        };
        
        await this.updateConversationContext(conversation.id, newContext);
        
        const response = `I found ${customers.length} customers named "${customerName}". Please choose which one:\n\n${customers.map((customer, index) => `${index + 1}. ${customer.name} - ${customer.email} (${customer.city || 'No city'})`).join('\n')}\n\nPlease tell me the number of the customer you want to create an invoice for.`;
        
        await this.addMessage(conversation.id, 'assistant', response);
        return {
          response,
          conversationId: conversation.id,
          context: newContext,
          action: 'show_customers',
          data: { customers }
        };
      }
    }

    // Handle customer selection from disambiguation
    if (context.step === 'customer_disambiguation') {
      const selectionMatch = userMessage.match(/(\d+)/);
      if (selectionMatch && context.customer_candidates) {
        const selectedIndex = parseInt(selectionMatch[1]) - 1;
        if (selectedIndex >= 0 && selectedIndex < context.customer_candidates.length) {
          const customer = context.customer_candidates[selectedIndex];
          const newContext: InvoiceCreationContext = {
            ...context,
            step: 'item_selection',
            selected_customer: customer,
            customer_candidates: undefined
          };
          
          await this.updateConversationContext(conversation.id, newContext);
          
          const items = await this.searchItems();
          const response = `Perfect! I've selected ${customer.name}. Now let's add items to the invoice. Here are some available items:\n\n${items.slice(0, 5).map((item, index) => `${index + 1}. ${item.name} - $${item.sale_price} (${item.description || 'No description'})`).join('\n')}\n\nYou can select items by number, tell me specific items you want, or say "create invoice" if you're ready to finish.`;
          
          await this.addMessage(conversation.id, 'assistant', response);
          return {
            response,
            conversationId: conversation.id,
            context: newContext,
            action: 'suggest_items',
            data: { customer, items }
          };
        }
      }
    }

    // Handle item selection
    if (context.step === 'item_selection') {
      if (userMessage.toLowerCase().includes('create invoice') || userMessage.toLowerCase().includes('finish')) {
        if (!context.selected_items || context.selected_items.length === 0) {
          const response = "You haven't selected any items yet. Please add some items to the invoice first.";
          await this.addMessage(conversation.id, 'assistant', response);
          return {
            response,
            conversationId: conversation.id,
            context
          };
        }

        // Create the invoice
        const subtotal = context.selected_items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
        const taxAmount = subtotal * 0.1; // Assuming 10% tax
        const total = subtotal + taxAmount;

        const invoiceData = {
          customer_id: context.selected_customer.id,
          subtotal,
          tax_amount: taxAmount,
          total,
          line_items: context.selected_items.map(item => ({
            description: item.name,
            quantity: item.quantity || 1,
            rate: item.rate || item.sale_price,
            total: (item.quantity || 1) * (item.rate || item.sale_price)
          })),
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 30 days from now
        };

        const invoice = await this.createInvoice(invoiceData);
        
        const newContext: InvoiceCreationContext = {
          ...context,
          step: 'invoice_creation',
          invoice_data: invoice
        };
        
        await this.updateConversationContext(conversation.id, newContext);
        
        const response = `🎉 Invoice created successfully!\n\n**Invoice #${invoice.invoice_number}**\nCustomer: ${context.selected_customer.name}\nTotal: $${total.toFixed(2)}\n\n[Click here to view/edit the invoice](/invoices/${invoice.id}/edit)`;
        
        await this.addMessage(conversation.id, 'assistant', response);
        return {
          response,
          conversationId: conversation.id,
          context: newContext,
          action: 'create_invoice',
          data: { invoice, editUrl: `/invoices/${invoice.id}/edit` }
        };
      }

      // Handle item selection by number or name
      const items = await this.searchItems();
      const numberMatch = userMessage.match(/(\d+)/g);
      let selectedItems = context.selected_items || [];

      if (numberMatch) {
        numberMatch.forEach(num => {
          const index = parseInt(num) - 1;
          if (index >= 0 && index < items.length) {
            const item = items[index];
            const existingItem = selectedItems.find(si => si.id === item.id);
            if (!existingItem) {
              selectedItems.push({
                ...item,
                quantity: 1,
                rate: item.sale_price
              });
            }
          }
        });
      }

      const newContext: InvoiceCreationContext = {
        ...context,
        selected_items: selectedItems
      };
      
      await this.updateConversationContext(conversation.id, newContext);
      
      const response = selectedItems.length > 0 
        ? `Added items to invoice:\n\n${selectedItems.map((item, index) => `${index + 1}. ${item.name} - Qty: ${item.quantity} x $${item.rate} = $${(item.quantity * item.rate).toFixed(2)}`).join('\n')}\n\nSubtotal: $${selectedItems.reduce((sum, item) => sum + (item.quantity * item.rate), 0).toFixed(2)}\n\nYou can add more items by number, or say "create invoice" when ready.`
        : "Please select items by their numbers (e.g., '1, 3, 5') or tell me which items you'd like to add.";
      
      await this.addMessage(conversation.id, 'assistant', response);
      return {
        response,
        conversationId: conversation.id,
        context: newContext,
        data: { selectedItems }
      };
    }

    // Default response
    const response = "I can help you create an invoice! Please tell me which customer you'd like to create an invoice for. For example: 'Create an invoice for John Smith' or 'I need to bill Sarah Johnson'.";
    await this.addMessage(conversation.id, 'assistant', response);
    
    return {
      response,
      conversationId: conversation.id,
      context
    };
  }
}

export const aiConversationService = new AIConversationService();