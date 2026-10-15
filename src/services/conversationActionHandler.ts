import {
  ConversationAction,
  ConversationContext,
  ActionResult,
  Customer,
  Invoice,
  Expense,
  LineItem
} from '../types';
import { conversationService } from './conversationService';
import { customerService, expenseService, invoiceService } from './supabaseService';

export class ConversationActionHandler {
  async executeAction(
    action: ConversationAction,
    context: ConversationContext,
    conversationId: string
  ): Promise<ActionResult> {
    try {
      switch (action.type) {
        case 'create_invoice':
          return await this.handleCreateInvoice(action, context, conversationId);
        case 'search_customers':
          return await this.handleSearchCustomers(action, context);
        case 'create_customer':
          return await this.handleCreateCustomer(action, context, conversationId);
        case 'create_expense':
          return await this.handleCreateExpense(action, context, conversationId);
        case 'generate_financial_report':
          return await this.handleGenerateReport(action, context);
        case 'find_invoice':
          return await this.handleFindInvoice(action, context);
        case 'send_invoice':
          return await this.handleSendInvoice(action, context);
        case 'navigate_to_invoice':
          return await this.handleNavigateToInvoice(action, context);
        default:
          return {
            success: false,
            error: `Unknown action type: ${action.type}`,
            suggestions: ['Try a different action', 'Ask for help']
          };
      }
    } catch (error) {
      console.error(`Error executing action ${action.type}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        suggestions: ['Try again', 'Provide more details', 'Ask for help']
      };
    }
  }

  private async handleCreateInvoice(
    action: ConversationAction,
    context: ConversationContext,
    conversationId: string
  ): Promise<ActionResult> {
    const { customer: customerName, items, amount } = action.parameters;

    // 1. Find or suggest creating customer
    let customer: Customer | null = null;
    
    if (customerName) {
      // First check recent entities
      customer = context.recentEntities.customers.find(
        c => c.name.toLowerCase().includes(customerName.toLowerCase())
      ) || null;

      // If not found in recent, search database
      if (!customer) {
        const matches = (await customerService.getCustomers()).filter((row) =>
          row.name.toLowerCase().includes(customerName.toLowerCase()),
        );
        customer = matches[0] ?? null;
      }

      if (!customer) {
        return {
          success: false,
          needsInfo: 'customer_not_found',
          suggestions: [
            `Create customer "${customerName}"`,
            'Search for a different customer',
            'Provide customer email or phone'
          ]
        };
      }
    } else {
      return {
        success: false,
        needsInfo: 'customer',
        suggestions: ['Specify customer name', 'Choose from recent customers']
      };
    }

    // 2. Prepare line items
    const lineItems: Omit<LineItem, 'id' | 'invoiceId'>[] = [];
    
    if (items && Array.isArray(items)) {
      for (const item of items) {
        const itemName = typeof item === 'string' ? item : item.value;
        const existingItem = context.recentEntities.items.find(
          i => i.name.toLowerCase().includes(itemName.toLowerCase())
        );

        if (existingItem) {
          lineItems.push({
            description: existingItem.name,
            quantity: 1,
            unit: existingItem.unit,
            rate: existingItem.salePrice || 0,
            tax: existingItem.taxRate || 0,
            total: existingItem.salePrice || 0
          });
        } else {
          // Create generic line item
          const rate = amount ? parseFloat(amount) : 0;
          lineItems.push({
            description: itemName,
            quantity: 1,
            unit: 'unit',
            rate,
            tax: 0,
            total: rate
          });
        }
      }
    } else if (amount) {
      // Single item with amount
      const rate = parseFloat(amount);
      lineItems.push({
        description: 'Service',
        quantity: 1,
        unit: 'unit',
        rate,
        tax: 0,
        total: rate
      });
    }

    if (lineItems.length === 0) {
      return {
        success: false,
        needsInfo: 'items',
        suggestions: ['Specify products or services', 'Provide amount for service']
      };
    }

    // 3. Generate invoice number
    const businessProfile = context.businessContext?.businessProfile;
    const sequence = (businessProfile?.invoiceNumberSequence || 0) + 1;
    const format = businessProfile?.invoiceNumberFormat || 'INV-{YYYY}-{###}';
    const invoiceNumber = this.generateInvoiceNumber(format, sequence);

    // 4. Calculate totals
    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = lineItems.reduce((sum, item) => sum + (item.total * (item.tax || 0) / 100), 0);
    const total = subtotal + taxAmount;

    // 5. Create invoice through the forked invoice service (Hono when the flag is on)
    const today = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let newInvoice: Invoice;
    try {
      newInvoice = await invoiceService.createInvoice(
        {
          invoiceNumber,
          customerId: customer.id,
          customer,
          date: today,
          dueDate,
          items: lineItems as LineItem[],
          subtotal,
          taxAmount,
          total,
          status: 'draft',
          notes: null,
          terms: null,
          currency: context.userPreferences.currency,
          templateName: context.userPreferences.defaultTemplate,
        },
        lineItems,
      );
    } catch (error) {
      return {
        success: false,
        error: `Failed to create invoice: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestions: ['Try again', 'Check customer details'],
      };
    }

    await conversationService.addEntityToContext(conversationId, 'invoices', newInvoice);

    return {
      success: true,
      data: {
        type: 'invoice',
        invoiceNumber: newInvoice.invoiceNumber,
        customerName: customer.name,
        total: newInvoice.total,
        currency: newInvoice.currency,
        status: newInvoice.status,
        dueDate: newInvoice.dueDate,
      },
      suggestions: [
        'Send this invoice via email',
        'Preview the invoice',
        'Create another invoice',
        'View invoice details'
      ]
    };
  }

  private async handleSearchCustomers(
    action: ConversationAction,
    context: ConversationContext
  ): Promise<ActionResult> {
    const { query } = action.parameters;

    if (!query) {
      return {
        success: false,
        needsInfo: 'search_query',
        suggestions: ['Provide customer name or email', 'Search by phone number']
      };
    }

    // Search in recent entities first
    const recentMatches = context.recentEntities.customers.filter(customer =>
      customer.name.toLowerCase().includes(query.toLowerCase()) ||
      customer.email.toLowerCase().includes(query.toLowerCase()) ||
      (customer.phone && customer.phone.includes(query))
    );

    const queryLower = query.toLowerCase();
    const databaseMatches = (await customerService.getCustomers()).filter(
      (customer) =>
        customer.name.toLowerCase().includes(queryLower) ||
        customer.email.toLowerCase().includes(queryLower) ||
        (customer.phone && customer.phone.includes(query)),
    ).slice(0, 10);
    
    // Combine and deduplicate
    const allMatches = [...recentMatches];
    databaseMatches.forEach(dbCustomer => {
      if (!allMatches.find(recent => recent.id === dbCustomer.id)) {
        allMatches.push(dbCustomer);
      }
    });

    if (allMatches.length === 0) {
      return {
        success: false,
        needsInfo: 'customer_not_found',
        suggestions: [
          `Create customer "${query}"`,
          'Try a different search term',
          'Search by email instead'
        ]
      };
    }

    return {
      success: true,
      data: {
        type: 'customers',
        customers: allMatches.slice(0, 5),
        count: allMatches.length
      },
      suggestions: [
        'Create invoice for customer',
        'View customer details',
        'Edit customer information'
      ]
    };
  }

  private async handleCreateCustomer(
    action: ConversationAction,
    context: ConversationContext,
    conversationId: string
  ): Promise<ActionResult> {
    const { name, email, phone, address } = action.parameters;

    if (!name) {
      return {
        success: false,
        needsInfo: 'customer_name',
        suggestions: ['Provide customer name', 'Include contact information']
      };
    }

    let newCustomer: Customer;
    try {
      newCustomer = await customerService.createCustomer({
        name,
        email: email || '',
        phone,
        address: address ?? null,
        city: null,
        state: null,
        zip: null,
        country: context.businessContext?.businessProfile?.country || 'NZ',
        isVip: false,
        tags: [],
      });
    } catch (error) {
      return {
        success: false,
        error: `Failed to create customer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestions: ['Try again', 'Check if customer already exists']
      };
    }

    await conversationService.addEntityToContext(conversationId, 'customers', newCustomer);

    return {
      success: true,
      data: {
        type: 'customer',
        name: newCustomer.name,
        email: newCustomer.email,
        phone: newCustomer.phone,
        isVip: newCustomer.isVip
      },
      suggestions: [
        'Create invoice for this customer',
        'Add more customer details',
        'Mark as VIP customer'
      ]
    };
  }

  private async handleCreateExpense(
    action: ConversationAction,
    context: ConversationContext,
    conversationId: string
  ): Promise<ActionResult> {
    const { amount, description, category } = action.parameters;

    if (!amount || !description) {
      return {
        success: false,
        needsInfo: !amount ? 'amount' : 'description',
        suggestions: ['Provide expense amount', 'Add expense description']
      };
    }

    const expenseAmount = parseFloat(amount.replace(/[^0-9.]/g, ''));
    if (isNaN(expenseAmount)) {
      return {
        success: false,
        error: 'Invalid amount format',
        suggestions: ['Use format like $100 or 100.50', 'Enter numeric amount']
      };
    }

    let newExpense: Expense;
    try {
      newExpense = await expenseService.createExpense({
        description,
        amount: expenseAmount,
        taxAmount: 0,
        currency: context.userPreferences.currency,
        expenseDate: new Date().toISOString().split('T')[0],
        status: 'pending',
        isBillable: false,
        categoryId: null,
        accountId: null,
        customerId: null,
        vendorName: null,
        receiptUrl: null,
        paymentMethod: null,
        notes: null,
      });
    } catch (error) {
      return {
        success: false,
        error: `Failed to create expense: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestions: ['Try again', 'Simplify the description']
      };
    }

    await conversationService.addEntityToContext(conversationId, 'expenses', newExpense);

    return {
      success: true,
      data: {
        type: 'expense',
        amount: expenseAmount,
        description,
        currency: context.userPreferences.currency,
        date: newExpense.expenseDate
      },
      suggestions: [
        'Upload receipt for this expense',
        'Categorize this expense',
        'Make this expense billable'
      ]
    };
  }

  private async handleGenerateReport(
    action: ConversationAction,
    context: ConversationContext
  ): Promise<ActionResult> {
    const { period, type } = action.parameters;

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    let endDate = now;

    switch (period?.toLowerCase()) {
      case 'this month':
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'this year':
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Default to this month
    }

    try {
      // Fetch financial data
      const start = startDate.toISOString().split('T')[0];
      const end = endDate.toISOString().split('T')[0];
      const [invoices, expenses] = await Promise.all([
        invoiceService.getInvoices().then((rows) =>
          rows.filter((row) => row.date >= start && row.date <= end),
        ),
        expenseService.getExpenses({ dateFrom: start, dateTo: end }),
      ]);

      // Calculate metrics
      const totalRevenue = invoices
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.total, 0);
      
      const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
      const profit = totalRevenue - totalExpenses;
      const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

      const outstandingInvoices = invoices
        .filter(inv => inv.status === 'sent' || inv.status === 'overdue')
        .reduce((sum, inv) => sum + inv.total, 0);

      return {
        success: true,
        data: {
          type: 'financial_report',
          period: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
          metrics: {
            totalRevenue,
            totalExpenses,
            profit,
            profitMargin: Math.round(profitMargin * 100) / 100,
            outstandingInvoices,
            invoiceCount: invoices.length,
            expenseCount: expenses.length
          },
          currency: context.userPreferences.currency
        },
        suggestions: [
          'Export report to PDF',
          'View detailed breakdown',
          'Compare with previous period',
          'Generate charts'
        ]
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestions: ['Try again', 'Specify different time period']
      };
    }
  }

  private async handleFindInvoice(
    action: ConversationAction,
    context: ConversationContext
  ): Promise<ActionResult> {
    const { query } = action.parameters;

    const queryLower = (query ?? '').toLowerCase();
    const invoices = (await invoiceService.getInvoices())
      .filter((invoice) => invoice.invoiceNumber.toLowerCase().includes(queryLower))
      .slice(0, 10);

    return {
      success: true,
      data: {
        type: 'invoices',
        invoices,
        count: invoices.length
      }
    };
  }

  private async handleSendInvoice(
    action: ConversationAction,
    context: ConversationContext
  ): Promise<ActionResult> {
    // This would integrate with the existing email service
    return {
      success: true,
      data: { type: 'email_sent' },
      suggestions: ['Track invoice status', 'Set payment reminder']
    };
  }

  private async handleNavigateToInvoice(
    action: ConversationAction,
    context: ConversationContext
  ): Promise<ActionResult> {
    const { invoiceId, editUrl } = action.parameters;
    
    return {
      success: true,
      data: {
        type: 'navigation',
        invoiceId,
        editUrl,
        action: 'navigate'
      },
      suggestions: ['Edit invoice details', 'Send invoice', 'Create another invoice']
    };
  }

  private generateInvoiceNumber(format: string, sequence: number): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return format
      .replace('{YYYY}', year.toString())
      .replace('{YY}', year.toString().slice(-2))
      .replace('{MM}', month)
      .replace('{DD}', day)
      .replace('{###}', String(sequence).padStart(3, '0'))
      .replace('{##}', String(sequence).padStart(2, '0'))
      .replace('{#}', sequence.toString());
  }

  private mapSupabaseCustomer(data: any): Customer {
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      country: data.country,
      phone: data.phone,
      isVip: data.is_vip,
      tags: data.tags,
      userId: data.user_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  private mapSupabaseExpense(data: any): Expense {
    return {
      id: data.id,
      description: data.description,
      amount: data.amount,
      categoryId: data.category_id,
      accountId: data.account_id,
      vendorName: data.vendor_name,
      receiptUrl: data.receipt_url,
      expenseDate: data.expense_date,
      status: data.status,
      isBillable: data.is_billable,
      customerId: data.customer_id,
      taxAmount: data.tax_amount,
      currency: data.currency,
      paymentMethod: data.payment_method,
      notes: data.notes,
      userId: data.user_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }
}

export const conversationActionHandler = new ConversationActionHandler();