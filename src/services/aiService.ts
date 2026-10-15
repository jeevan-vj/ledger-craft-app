import { 
  ConversationMessage, 
  ConversationIntent, 
  ConversationEntity, 
  ConversationAction, 
  ConversationContext, 
  AIResponse, 
  ActionResult 
} from '../types';
import { customerService, itemService, invoiceService } from './supabaseService';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AIConversationService {
  private apiKey: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_OPENAI_API_KEY || '';
    if (!this.apiKey) {
      console.warn('OpenAI API key not found. AI conversation features will be disabled.');
    }
  }

  async processMessage(
    message: string, 
    context: ConversationContext,
    conversationHistory: ConversationMessage[] = []
  ): Promise<AIResponse> {
    try {
      // 1. Intent classification and entity extraction
      const analysis = await this.analyzeMessage(message, context, conversationHistory);
      
      // 2. Generate appropriate response
      const response = await this.generateResponse(analysis, context);
      
      return response;
    } catch (error) {
      console.error('Error processing AI message:', error);
      return {
        message: "I'm sorry, I'm having trouble understanding your request right now. Could you please try again?",
        intent: 'unknown',
        entities: [],
        actions: [],
        needsConfirmation: false,
        suggestedActions: ['Try rephrasing your request', 'Ask for help with a specific task']
      };
    }
  }

  private async analyzeMessage(
    message: string,
    context: ConversationContext,
    history: ConversationMessage[]
  ): Promise<{
    intent: ConversationIntent;
    entities: ConversationEntity[];
    confidence: number;
  }> {
    const systemPrompt = this.buildAnalysisPrompt(context);
    const conversationMessages = this.buildConversationHistory(history, message);

    const response = await this.callOpenAI([
      { role: 'system', content: systemPrompt },
      ...conversationMessages
    ]);

    try {
      const analysis = JSON.parse(response);
      return {
        intent: analysis.intent || 'unknown',
        entities: analysis.entities || [],
        confidence: analysis.confidence || 0.5
      };
    } catch (error) {
      console.error('Error parsing AI analysis:', error);
      return {
        intent: 'unknown',
        entities: [],
        confidence: 0.1
      };
    }
  }

  private async generateResponse(
    analysis: { intent: ConversationIntent; entities: ConversationEntity[]; confidence: number },
    context: ConversationContext
  ): Promise<AIResponse> {
    const { intent, entities, confidence } = analysis;

    // Determine if we need more information
    const missingInfo = this.identifyMissingInformation(intent, entities, context);
    
    if (missingInfo.length > 0) {
      return {
        message: this.generateInfoRequestMessage(intent, missingInfo),
        intent,
        entities,
        actions: [],
        needsConfirmation: false,
        suggestedActions: this.getSuggestedActions(intent, entities)
      };
    }

    // Plan actions
    const actions = this.planActions(intent, entities, context);
    
    // Generate confirmation message if needed
    const needsConfirmation = this.shouldConfirmAction(intent, actions);
    const message = needsConfirmation 
      ? this.generateConfirmationMessage(intent, entities, actions)
      : this.generateExecutionMessage(intent, entities, actions);

    return {
      message,
      intent,
      entities,
      actions,
      needsConfirmation,
      suggestedActions: this.getSuggestedActions(intent, entities)
    };
  }

  private buildAnalysisPrompt(context: ConversationContext): string {
    return `You are a business assistant AI for EasyBizInvoice, an expense tracking and invoice management application.

Your job is to analyze user messages and extract:
1. Intent - what the user wants to do
2. Entities - specific business data mentioned (customers, amounts, dates, etc.)
3. Confidence - how confident you are in your analysis (0-1)

IMPORTANT RULES:
- When user says "create invoice" or "invoice for [name]", the intent is ALWAYS "create_invoice"
- The customer entity should be the actual customer name, NOT the phrase "create an invoice"
- Focus on extracting the real customer name from phrases like "invoice for John", "bill Sarah", etc.

Available intents:
- create_invoice: User wants to create a new invoice (phrases: "create invoice", "invoice for", "bill", "make invoice")
- edit_invoice: User wants to modify an existing invoice
- send_invoice: User wants to send an invoice to a customer
- track_payment: User wants to check payment status
- create_customer: User wants to add a new customer (only when explicitly asking to add/create customer)
- find_customer: User wants to search for a customer
- update_customer: User wants to modify customer information
- add_expense: User wants to record an expense
- categorize_expense: User wants to categorize expenses
- scan_receipt: User wants to scan a receipt
- generate_report: User wants to create a report
- show_analytics: User wants to see analytics/charts
- financial_summary: User wants a financial overview
- help: User needs assistance
- clarification: User is asking for clarification
- greeting: User is greeting or starting conversation
- unknown: Intent is unclear

Entity types to extract:
- customer: Customer names or identifiers (extract actual names, not action phrases)
- amount: Monetary values
- date: Dates or time periods
- product: Products or services
- service: Services offered
- invoice: Invoice numbers or references
- expense: Expense descriptions
- category: Category names

EXAMPLES:
"Create an invoice for James" → intent: "create_invoice", entities: [{"type": "customer", "value": "James", "confidence": 0.9}]
"I need to bill Sarah Smith" → intent: "create_invoice", entities: [{"type": "customer", "value": "Sarah Smith", "confidence": 0.9}]
"Create customer John Doe" → intent: "create_customer", entities: [{"type": "customer", "value": "John Doe", "confidence": 0.9}]

Current business context:
${context.businessContext ? `Business: ${context.businessContext.businessProfile?.name}` : ''}
Recent customers: ${context.recentEntities.customers.map(c => c.name).join(', ') || 'None'}
Recent invoices: ${context.recentEntities.invoices.length} invoices
Currency: ${context.userPreferences.currency}

Return your analysis as JSON:
{
  "intent": "intent_name",
  "entities": [
    {
      "type": "entity_type",
      "value": "extracted_value",
      "confidence": 0.9
    }
  ],
  "confidence": 0.8
}`;
  }

  private buildConversationHistory(history: ConversationMessage[], currentMessage: string): OpenAIMessage[] {
    const messages: OpenAIMessage[] = [];
    
    // Include last 5 messages for context
    const recentHistory = history.slice(-5);
    
    recentHistory.forEach(msg => {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    });

    // Add current message
    messages.push({
      role: 'user',
      content: currentMessage
    });

    return messages;
  }

  private async callOpenAI(messages: OpenAIMessage[]): Promise<string> {
    const useHono = import.meta.env.VITE_AI_API !== 'false' || Boolean(this.apiKey);
    if (!useHono) {
      const lastMessage = messages[messages.length - 1]?.content || '';
      return this.fallbackAnalysis(lastMessage);
    }

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
      });

      if (!response.ok) {
        console.error(`Chat API error: ${response.statusText}`);
        const lastMessage = messages[messages.length - 1]?.content || '';
        return this.fallbackAnalysis(lastMessage);
      }

      const data = (await response.json()) as { content?: string };
      return data.content || this.fallbackAnalysis(messages[messages.length - 1]?.content || '');
    } catch (error) {
      console.error('Chat API call failed:', error);
      const lastMessage = messages[messages.length - 1]?.content || '';
      return this.fallbackAnalysis(lastMessage);
    }
  }

  private fallbackAnalysis(message: string): string {
    const lowerMessage = message.toLowerCase();
    
    // Invoice creation patterns
    if (lowerMessage.includes('create') && lowerMessage.includes('invoice')) {
      const customerMatch = message.match(/(?:invoice|bill|create).*?for\s+([A-Za-z\s]{2,30})/i);
      const customerName = customerMatch ? customerMatch[1].trim() : '';
      
      return JSON.stringify({
        intent: 'create_invoice',
        entities: customerName ? [{ type: 'customer', value: customerName, confidence: 0.8 }] : [],
        confidence: 0.7
      });
    }
    
    // Customer creation patterns
    if ((lowerMessage.includes('create') || lowerMessage.includes('add')) && lowerMessage.includes('customer')) {
      const nameMatch = message.match(/(?:customer|client)\s+([A-Za-z\s]{2,30})/i);
      const customerName = nameMatch ? nameMatch[1].trim() : '';
      
      return JSON.stringify({
        intent: 'create_customer',
        entities: customerName ? [{ type: 'customer', value: customerName, confidence: 0.8 }] : [],
        confidence: 0.7
      });
    }
    
    // Default fallback
    return JSON.stringify({
      intent: 'unknown',
      entities: [],
      confidence: 0.3
    });
  }

  private identifyMissingInformation(
    intent: ConversationIntent,
    entities: ConversationEntity[],
    context: ConversationContext
  ): string[] {
    const missing: string[] = [];

    switch (intent) {
      case 'create_invoice':
        // Check current invoice creation step
        const invoiceStep = context.currentInvoiceCreation?.step;
        
        if (!invoiceStep || invoiceStep === 'customer_search') {
          if (!entities.find(e => e.type === 'customer')) {
            missing.push('customer');
          }
        } else if (invoiceStep === 'customer_disambiguation') {
          if (!context.currentInvoiceCreation?.selectedCustomer && 
              !entities.find(e => e.type === 'selection')) {
            missing.push('customer_selection');
          }
        } else if (invoiceStep === 'item_selection') {
          if (!context.currentInvoiceCreation?.selectedItems?.length && 
              !entities.find(e => e.type === 'product' || e.type === 'service' || e.type === 'selection')) {
            missing.push('items');
          }
        }
        break;
      
      case 'find_customer':
        if (!entities.find(e => e.type === 'customer')) {
          missing.push('customer_name');
        }
        break;
      
      case 'add_expense':
        if (!entities.find(e => e.type === 'amount')) {
          missing.push('amount');
        }
        break;
      
      case 'generate_report':
        if (!entities.find(e => e.type === 'date')) {
          missing.push('time_period');
        }
        break;
    }

    return missing;
  }

  private generateInfoRequestMessage(intent: ConversationIntent, missingInfo: string[]): string {
    const requests = missingInfo.map(info => {
      switch (info) {
        case 'customer':
          return 'Which customer is this for?';
        case 'customer_selection':
          return 'Please tell me the number of the customer you want to select.';
        case 'items':
          return 'What products or services should I include?';
        case 'amount':
          return 'What is the amount?';
        case 'customer_name':
          return 'What is the customer\'s name?';
        case 'time_period':
          return 'What time period should I include in the report?';
        default:
          return `What is the ${info}?`;
      }
    });

    return `I'd be happy to help you with that! I need a bit more information: ${requests.join(' ')}`;
  }

  private planActions(
    intent: ConversationIntent,
    entities: ConversationEntity[],
    context: ConversationContext
  ): ConversationAction[] {
    const actions: ConversationAction[] = [];

    switch (intent) {
      case 'create_invoice':
        actions.push({
          type: 'create_invoice',
          parameters: {
            customer: entities.find(e => e.type === 'customer')?.value,
            items: entities.filter(e => e.type === 'product' || e.type === 'service'),
            amount: entities.find(e => e.type === 'amount')?.value
          },
          status: 'pending'
        });
        break;
      
      case 'find_customer':
        actions.push({
          type: 'search_customers',
          parameters: {
            query: entities.find(e => e.type === 'customer')?.value
          },
          status: 'pending'
        });
        break;
      
      case 'add_expense':
        actions.push({
          type: 'create_expense',
          parameters: {
            amount: entities.find(e => e.type === 'amount')?.value,
            description: entities.find(e => e.type === 'expense')?.value,
            category: entities.find(e => e.type === 'category')?.value
          },
          status: 'pending'
        });
        break;
      
      case 'generate_report':
        actions.push({
          type: 'generate_financial_report',
          parameters: {
            period: entities.find(e => e.type === 'date')?.value,
            type: 'summary'
          },
          status: 'pending'
        });
        break;
    }

    return actions;
  }

  private shouldConfirmAction(intent: ConversationIntent, actions: ConversationAction[]): boolean {
    // Only confirm truly destructive or high-value actions
    const sensitiveIntents = ['send_invoice', 'delete_invoice', 'delete_customer'];
    const highValueActions = actions.filter(a => 
      a.type === 'send_invoice' || 
      a.type === 'delete_invoice' || 
      a.type === 'delete_customer' ||
      (a.type === 'create_expense' && parseFloat(a.parameters.amount?.toString() || '0') > 1000)
    );
    
    return sensitiveIntents.includes(intent) || highValueActions.length > 0;
  }

  private generateConfirmationMessage(
    intent: ConversationIntent,
    entities: ConversationEntity[],
    actions: ConversationAction[]
  ): string {
    switch (intent) {
      case 'create_invoice':
        const customer = entities.find(e => e.type === 'customer')?.value;
        const items = entities.filter(e => e.type === 'product' || e.type === 'service');
        return `I'll create an invoice for ${customer} with ${items.length > 0 ? items.map(i => i.value).join(', ') : 'the specified items'}. Should I proceed?`;
      
      case 'add_expense':
        const amount = entities.find(e => e.type === 'amount')?.value;
        const description = entities.find(e => e.type === 'expense')?.value;
        return `I'll record an expense of ${amount} for "${description}". Is this correct?`;
      
      default:
        return 'Should I proceed with this action?';
    }
  }

  private generateExecutionMessage(
    intent: ConversationIntent,
    entities: ConversationEntity[],
    actions: ConversationAction[]
  ): string {
    switch (intent) {
      case 'find_customer':
        return 'Let me search for that customer...';
      case 'generate_report':
        return 'Generating your financial report...';
      case 'show_analytics':
        return 'Here are your latest analytics...';
      default:
        return 'Processing your request...';
    }
  }

  private getSuggestedActions(intent: ConversationIntent, entities: ConversationEntity[]): string[] {
    switch (intent) {
      case 'create_invoice':
        return ['Send invoice via email', 'Preview invoice', 'Save as draft'];
      case 'find_customer':
        return ['Create new invoice', 'View customer details', 'Edit customer'];
      case 'generate_report':
        return ['Export to PDF', 'View detailed breakdown', 'Compare with previous period'];
      default:
        return ['Ask for help', 'Try a different request'];
    }
  }

  // Invoice creation helper methods
  async searchCustomersByName(name: string): Promise<any[]> {
    try {
      const needle = name.toLowerCase();
      return (await customerService.getCustomers())
        .filter((customer) => customer.name.toLowerCase().includes(needle))
        .slice(0, 10);
    } catch (error) {
      console.error('Exception in searchCustomersByName:', error);
      return [];
    }
  }

  async getAvailableItems(): Promise<any[]> {
    try {
      return (await itemService.getItems()).filter((item) => item.enableSaleInfo).slice(0, 20);
    } catch (error) {
      console.error('Exception in getAvailableItems:', error);
      return [];
    }
  }

  async generateInvoiceNumber(): Promise<string> {
    try {
      return await invoiceService.getNextInvoiceNumber();
    } catch (error) {
      console.error('Exception in generateInvoiceNumber:', error);
      return `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    }
  }

  async createInvoiceFromData(invoiceData: any): Promise<any> {
    try {
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
      return await invoiceService.createInvoice(
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
    } catch (error) {
      console.error('Exception in createInvoiceFromData:', error);
      throw error;
    }
  }

  // Enhanced message processing for invoice creation flow
  async processInvoiceCreationFlow(
    message: string,
    context: ConversationContext,
    conversationHistory: ConversationMessage[]
  ): Promise<AIResponse> {
    const currentStep = context.currentInvoiceCreation?.step || 'customer_search';
    
    try {
      switch (currentStep) {
        case 'customer_search':
          return await this.handleCustomerSearch(message, context);
        
        case 'customer_disambiguation':
          return await this.handleCustomerSelection(message, context);
        
        case 'item_selection':
          return await this.handleItemSelection(message, context);
        
        case 'invoice_creation':
          return await this.handleInvoiceCreation(message, context);
        
        default:
          return await this.processMessage(message, context, conversationHistory);
      }
    } catch (error) {
      console.error('Error in invoice creation flow:', error);
      
      // Provide more specific error messages based on error type
      let errorMessage = "I encountered an error processing your invoice request.";
      let suggestedActions = ['Try again', 'Start new invoice'];
      
      if (error instanceof Error) {
        if (error.message.includes('not authenticated')) {
          errorMessage = "It looks like you need to log in again. Please refresh the page and try again.";
          suggestedActions = ['Refresh page', 'Log in again'];
        } else if (error.message.includes('customer_id')) {
          errorMessage = "I had trouble finding that customer. Let's start over - which customer would you like to create an invoice for?";
          suggestedActions = ['Tell me the customer name', 'Create new customer'];
        } else if (error.message.includes('Failed to create invoice')) {
          errorMessage = "I couldn't create the invoice due to a database error. Please try again in a moment.";
          suggestedActions = ['Try again', 'Contact support'];
        }
      }
      
      return {
        message: errorMessage,
        intent: 'create_invoice',
        entities: [],
        actions: [],
        needsConfirmation: false,
        suggestedActions,
        context: { ...context, currentInvoiceCreation: { step: 'customer_search' } }
      };
    }
  }

  private async handleCustomerSearch(message: string, context: ConversationContext): Promise<AIResponse> {
    // Enhanced customer name extraction patterns
    const customerNameMatch = 
      message.match(/(?:invoice|bill|create).*?for\s+([A-Za-z\s]{2,30})/i) ||
      message.match(/(?:bill|invoice)\s+([A-Za-z\s]{2,30})/i) ||
      message.match(/(?:customer|client)\s+([A-Za-z\s]{2,30})/i) ||
      message.match(/^([A-Za-z\s]{2,30})$/i);
    
    if (!customerNameMatch) {
      return {
        message: "I'd be happy to help you create an invoice! Please tell me which customer this is for. For example: 'Create an invoice for John Smith'",
        intent: 'create_invoice',
        entities: [],
        actions: [],
        needsConfirmation: false,
        suggestedActions: ['Tell me the customer name'],
        context
      };
    }

    const customerName = customerNameMatch[1].trim();
    
    // Filter out common non-customer phrases
    const invalidNames = ['create an invoice', 'create invoice', 'an invoice', 'invoice', 'bill', 'make invoice', 'new invoice'];
    if (invalidNames.some(invalid => customerName.toLowerCase().includes(invalid))) {
      return {
        message: "I'd be happy to help you create an invoice! Please tell me which customer this is for. For example: 'Create an invoice for John Smith'",
        intent: 'create_invoice',
        entities: [],
        actions: [],
        needsConfirmation: false,
        suggestedActions: ['Tell me the customer name'],
        context
      };
    }
    
    const customers = await this.searchCustomersByName(customerName);

    if (customers.length === 0) {
      return {
        message: `I couldn't find any customers named "${customerName}". Would you like me to create a new customer with this name, or would you like to search for a different customer?`,
        intent: 'create_invoice',
        entities: [{ type: 'customer', value: customerName, confidence: 0.8 }],
        actions: [{
          type: 'create_customer',
          parameters: { name: customerName, email: '' },
          status: 'pending'
        }],
        needsConfirmation: false, // Removed confirmation for smoother UX
        suggestedActions: ['Create new customer', 'Search different name'],
        context
      };
    } else if (customers.length === 1) {
      const customer = customers[0];
      const items = await this.getAvailableItems();
      
      return {
        message: `Great! I found ${customer.name}. Now let's add some items to the invoice. Here are some available items:\n\n${items.slice(0, 5).map((item, index) => `${index + 1}. ${item.name} - $${item.salePrice} ${item.description ? `(${item.description})` : ''}`).join('\n')}\n\nYou can select items by number or tell me specific items you'd like to add.`,
        intent: 'create_invoice',
        entities: [{ type: 'customer', value: customer.name, confidence: 1.0 }],
        actions: [],
        needsConfirmation: false,
        suggestedActions: ['Select items by number', 'Add custom item'],
        context: {
          ...context,
          currentInvoiceCreation: {
            step: 'item_selection',
            selectedCustomer: customer,
            availableItems: items
          }
        }
      };
    } else {
      return {
        message: `I found ${customers.length} customers named "${customerName}". Please choose which one:\n\n${customers.map((customer, index) => `${index + 1}. ${customer.name} - ${customer.email} ${customer.city ? `(${customer.city})` : ''}`).join('\n')}\n\nPlease tell me the number of the customer you want.`,
        intent: 'create_invoice',
        entities: [{ type: 'customer', value: customerName, confidence: 0.8 }],
        actions: [],
        needsConfirmation: false,
        suggestedActions: ['Select customer by number'],
        context: {
          ...context,
          currentInvoiceCreation: {
            step: 'customer_disambiguation',
            customerCandidates: customers,
            searchTerm: customerName
          }
        }
      };
    }
  }

  private async handleCustomerSelection(message: string, context: ConversationContext): Promise<AIResponse> {
    const selectionMatch = message.match(/(\d+)/);
    const candidates = context.currentInvoiceCreation?.customerCandidates;
    
    if (!selectionMatch || !candidates) {
      return {
        message: "Please select a customer by entering the number (1, 2, 3, etc.)",
        intent: 'create_invoice',
        entities: [],
        actions: [],
        needsConfirmation: false,
        suggestedActions: ['Enter customer number'],
        context
      };
    }

    const selectedIndex = parseInt(selectionMatch[1]) - 1;
    if (selectedIndex < 0 || selectedIndex >= candidates.length) {
      return {
        message: `Please enter a valid number between 1 and ${candidates.length}`,
        intent: 'create_invoice',
        entities: [],
        actions: [],
        needsConfirmation: false,
        suggestedActions: ['Enter valid number'],
        context
      };
    }

    const customer = candidates[selectedIndex];
    const items = await this.getAvailableItems();
    
    return {
      message: `Perfect! I've selected ${customer.name}. Now let's add items to the invoice. Here are some available items:\n\n${items.slice(0, 5).map((item, index) => `${index + 1}. ${item.name} - $${item.salePrice} ${item.description ? `(${item.description})` : ''}`).join('\n')}\n\nYou can select items by number, or say "create invoice" when you're ready to finish.`,
      intent: 'create_invoice',
      entities: [{ type: 'customer', value: customer.name, confidence: 1.0 }],
      actions: [],
      needsConfirmation: false,
      suggestedActions: ['Select items', 'Create invoice'],
      context: {
        ...context,
        currentInvoiceCreation: {
          step: 'item_selection',
          selectedCustomer: customer,
          availableItems: items,
          selectedItems: []
        }
      }
    };
  }

  private async handleItemSelection(message: string, context: ConversationContext): Promise<AIResponse> {
    const currentCreation = context.currentInvoiceCreation;
    if (!currentCreation?.selectedCustomer) {
      return {
        message: "Something went wrong. Let's start over - which customer would you like to create an invoice for?",
        intent: 'create_invoice',
        entities: [],
        actions: [],
        needsConfirmation: false,
        suggestedActions: ['Start over'],
        context: { ...context, currentInvoiceCreation: { step: 'customer_search' } }
      };
    }

    if (message.toLowerCase().includes('create invoice') || message.toLowerCase().includes('finish')) {
      if (!currentCreation.selectedItems?.length) {
        return {
          message: "You haven't selected any items yet. Please add some items to the invoice first.",
          intent: 'create_invoice',
          entities: [],
          actions: [],
          needsConfirmation: false,
          suggestedActions: ['Add items'],
          context
        };
      }

      return await this.finalizeInvoice(context);
    }

    // Handle item selection by number
    const numberMatches = message.match(/(\d+)/g);
    let selectedItems = currentCreation.selectedItems || [];
    const availableItems = currentCreation.availableItems || [];

    if (numberMatches) {
      numberMatches.forEach(num => {
        const index = parseInt(num) - 1;
        if (index >= 0 && index < availableItems.length) {
          const item = availableItems[index];
          const existingItem = selectedItems.find(si => si.id === item.id);
          if (!existingItem) {
            selectedItems.push({
              ...item,
              quantity: 1,
              rate: item.salePrice
            });
          }
        }
      });
    }

    const subtotal = selectedItems.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    
    return {
      message: selectedItems.length > 0 
        ? `Added items to invoice:\n\n${selectedItems.map((item, index) => `${index + 1}. ${item.name} - Qty: ${item.quantity} x $${item.rate} = $${(item.quantity * item.rate).toFixed(2)}`).join('\n')}\n\nSubtotal: $${subtotal.toFixed(2)}\n\nYou can add more items by number, or say "create invoice" when ready.`
        : "Please select items by their numbers (e.g., '1, 3, 5') or tell me which items you'd like to add.",
      intent: 'create_invoice',
      entities: [],
      actions: [],
      needsConfirmation: false,
      suggestedActions: selectedItems.length > 0 ? ['Add more items', 'Create invoice'] : ['Select items'],
      context: {
        ...context,
        currentInvoiceCreation: {
          ...currentCreation,
          selectedItems
        }
      }
    };
  }

  private async finalizeInvoice(context: ConversationContext): Promise<AIResponse> {
    const currentCreation = context.currentInvoiceCreation;
    if (!currentCreation?.selectedCustomer || !currentCreation?.selectedItems?.length) {
      throw new Error('Invalid invoice creation state');
    }

    const subtotal = currentCreation.selectedItems.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    const taxAmount = subtotal * 0.1; // 10% tax
    const total = subtotal + taxAmount;

    const invoiceData = {
      customer_id: currentCreation.selectedCustomer.id,
      subtotal,
      tax_amount: taxAmount,
      total,
      line_items: currentCreation.selectedItems.map(item => ({
        description: item.name,
        quantity: item.quantity || 1,
        rate: item.rate || item.salePrice,
        total: (item.quantity || 1) * (item.rate || item.salePrice)
      })),
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 30 days from now
    };

    const invoice = await this.createInvoiceFromData(invoiceData);
    
    return {
      message: `🎉 Invoice created successfully!\n\n**Invoice #${invoice.invoice_number}**\nCustomer: ${currentCreation.selectedCustomer.name}\nTotal: $${total.toFixed(2)}\n\nThe invoice has been saved as a draft. You can edit it anytime.`,
      intent: 'create_invoice',
      entities: [],
      actions: [{
        type: 'navigate_to_invoice',
        parameters: { 
          invoiceId: invoice.id, 
          editUrl: `/invoices/${invoice.id}/edit`,
          invoiceNumber: invoice.invoice_number
        },
        status: 'completed'
      }],
      needsConfirmation: false,
      suggestedActions: ['View invoice', 'Create another invoice', 'Send invoice'],
      context: {
        ...context,
        currentInvoiceCreation: {
          step: 'invoice_creation',
          completedInvoice: invoice
        }
      }
    };
  }

  private async handleInvoiceCreation(message: string, context: ConversationContext): Promise<AIResponse> {
    return {
      message: "Your invoice has been created! Would you like to create another invoice or do something else?",
      intent: 'help',
      entities: [],
      actions: [],
      needsConfirmation: false,
      suggestedActions: ['Create another invoice', 'View invoices', 'Ask for help'],
      context: { ...context, currentInvoiceCreation: undefined }
    };
  }

  // Utility method to check if API is configured
  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }
}

export const aiService = new AIConversationService();