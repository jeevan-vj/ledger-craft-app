import {
  ConversationSession,
  ConversationMessage,
  ConversationContext,
  AIResponse,
  ConversationAction,
  ConversationEntity,
  Customer,
  Invoice,
  Expense,
  Item
} from '../../types';

// Mock Customer Data
export const mockCustomer: Customer = {
  id: 'customer-1',
  name: 'John Smith',
  email: 'john@example.com',
  address: '123 Main St',
  city: 'New York',
  state: 'NY',
  zip: '10001',
  country: 'US',
  phone: '+1-555-0123',
  isVip: false,
  tags: ['web-design'],
  userId: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};

export const mockVipCustomer: Customer = {
  ...mockCustomer,
  id: 'customer-2',
  name: 'Sarah Johnson',
  email: 'sarah@example.com',
  isVip: true,
  tags: ['premium', 'consulting']
};

// Mock Invoice Data
export const mockInvoice: Invoice = {
  id: 'invoice-1',
  invoiceNumber: 'INV-2024-001',
  customerId: 'customer-1',
  customer: mockCustomer,
  date: '2024-01-01',
  dueDate: '2024-01-31',
  items: [
    {
      id: 'item-1',
      invoiceId: 'invoice-1',
      description: 'Web Design Services',
      quantity: 1,
      unit: 'project',
      rateUnit: 'project',
      rate: 500,
      tax: 0,
      total: 500
    }
  ],
  subtotal: 500,
  taxAmount: 0,
  total: 500,
  status: 'draft',
  currency: 'USD',
  templateName: 'modern'
};

// Mock Expense Data
export const mockExpense: Expense = {
  id: 'expense-1',
  description: 'Office Supplies',
  amount: 150,
  categoryId: 'category-1',
  expenseDate: '2024-01-01',
  status: 'pending',
  isBillable: false,
  taxAmount: 0,
  currency: 'USD',
  userId: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};

// Mock Item Data
export const mockItem: Item = {
  id: 'item-1',
  name: 'Web Design Service',
  description: 'Complete website design and development',
  type: 'service',
  salePrice: 500,
  taxRate: 0,
  enableSaleInfo: true,
  enablePurchaseInfo: false,
  unit: 'project',
  userId: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};

// Mock Conversation Context
export const mockConversationContext: ConversationContext = {
  recentEntities: {
    customers: [mockCustomer, mockVipCustomer],
    invoices: [mockInvoice],
    expenses: [mockExpense],
    items: [mockItem]
  },
  userPreferences: {
    defaultTemplate: 'modern',
    currency: 'USD',
    dateFormat: 'MM/DD/YYYY',
    language: 'en'
  },
  businessContext: {
    businessProfile: {
      id: 'business-1',
      name: 'Test Business',
      email: 'business@example.com',
      country: 'US',
      address: null,
      city: null,
      state: null,
      zip: null,
      invoiceNumberFormat: 'INV-{YYYY}-{###}',
      invoiceNumberSequence: 1
    },
    recentActivity: [
      'Recent invoice: INV-2024-001 for John Smith',
      'Recent expense: $150 for Office Supplies'
    ]
  }
};

// Mock Conversation Messages
export const mockUserMessage: ConversationMessage = {
  id: 'message-1',
  conversationId: 'conversation-1',
  role: 'user',
  content: 'Create an invoice for John Smith for web design services, $500',
  timestamp: new Date('2024-01-01T10:00:00Z'),
  metadata: {
    entities: [
      {
        type: 'customer',
        value: 'John Smith',
        confidence: 0.9,
        resolved: true,
        resolvedValue: mockCustomer
      },
      {
        type: 'service',
        value: 'web design services',
        confidence: 0.8,
        resolved: false
      },
      {
        type: 'amount',
        value: '$500',
        confidence: 0.95,
        resolved: true,
        resolvedValue: 500
      }
    ]
  }
};

export const mockAssistantMessage: ConversationMessage = {
  id: 'message-2',
  conversationId: 'conversation-1',
  role: 'assistant',
  content: "I'll create an invoice for John Smith for web design services. I found John Smith in your customer list. Should I proceed with creating the invoice for $500?",
  timestamp: new Date('2024-01-01T10:00:30Z'),
  metadata: {
    intent: 'create_invoice',
    confidence: 0.95,
    actions: [
      {
        type: 'create_invoice',
        parameters: {
          customer: 'John Smith',
          items: ['web design services'],
          amount: '500'
        },
        status: 'pending'
      }
    ],
    suggestedActions: [
      'Send invoice via email',
      'Preview invoice',
      'Create another invoice'
    ]
  }
};

// Mock Conversation Session
export const mockConversationSession: ConversationSession = {
  id: 'conversation-1',
  userId: 'user-1',
  title: 'Create invoice for John Smith',
  messages: [mockUserMessage, mockAssistantMessage],
  context: mockConversationContext,
  status: 'active',
  createdAt: '2024-01-01T10:00:00Z',
  updatedAt: '2024-01-01T10:00:30Z'
};

// Mock AI Response
export const mockAIResponse: AIResponse = {
  message: "I'll help you create an invoice for John Smith. I found John Smith in your customer list. Should I proceed with creating the invoice for $500?",
  intent: 'create_invoice',
  entities: [
    {
      type: 'customer',
      value: 'John Smith',
      confidence: 0.9,
      resolved: true,
      resolvedValue: mockCustomer
    },
    {
      type: 'amount',
      value: '$500',
      confidence: 0.95,
      resolved: true,
      resolvedValue: 500
    }
  ],
  actions: [
    {
      type: 'create_invoice',
      parameters: {
        customer: 'John Smith',
        items: ['web design services'],
        amount: '500'
      },
      status: 'pending'
    }
  ],
  needsConfirmation: true,
  suggestedActions: [
    'Send invoice via email',
    'Preview invoice',
    'Create another invoice'
  ]
};

// Mock Conversation Actions
export const mockCreateInvoiceAction: ConversationAction = {
  type: 'create_invoice',
  parameters: {
    customer: 'John Smith',
    items: ['web design services'],
    amount: '500'
  },
  status: 'pending'
};

export const mockSearchCustomersAction: ConversationAction = {
  type: 'search_customers',
  parameters: {
    query: 'Sarah'
  },
  status: 'pending'
};

export const mockCreateExpenseAction: ConversationAction = {
  type: 'create_expense',
  parameters: {
    amount: '$150',
    description: 'Office supplies',
    category: 'business'
  },
  status: 'pending'
};

// Mock OpenAI Responses
export const mockOpenAIAnalysisResponse = {
  intent: 'create_invoice',
  entities: [
    {
      type: 'customer',
      value: 'John Smith',
      confidence: 0.9
    },
    {
      type: 'service',
      value: 'web design services',
      confidence: 0.8
    },
    {
      type: 'amount',
      value: '$500',
      confidence: 0.95
    }
  ],
  confidence: 0.85
};

// Test Utilities
export const createMockConversation = (overrides: Partial<ConversationSession> = {}): ConversationSession => ({
  ...mockConversationSession,
  ...overrides
});

export const createMockMessage = (overrides: Partial<ConversationMessage> = {}): ConversationMessage => ({
  ...mockUserMessage,
  ...overrides
});

export const createMockAIResponse = (overrides: Partial<AIResponse> = {}): AIResponse => ({
  ...mockAIResponse,
  ...overrides
});

export const createMockAction = (overrides: Partial<ConversationAction> = {}): ConversationAction => ({
  ...mockCreateInvoiceAction,
  ...overrides
});

// Mock Supabase Responses
export const mockSupabaseResponse = {
  success: <T>(data: T) => ({ data, error: null }),
  error: (message: string) => ({ data: null, error: { message } })
};

// Mock fetch response for OpenAI
export const mockOpenAIFetchResponse = (response: unknown) => ({
  ok: true,
  json: async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify(response)
        }
      }
    ]
  })
});

// Test conversation scenarios
export const conversationScenarios = {
  createInvoice: {
    userInput: 'Create an invoice for John Smith for web design services, $500',
    expectedIntent: 'create_invoice',
    expectedEntities: ['customer', 'service', 'amount'],
    expectedActions: ['create_invoice']
  },
  findCustomer: {
    userInput: 'Do we have a customer named Sarah?',
    expectedIntent: 'find_customer',
    expectedEntities: ['customer'],
    expectedActions: ['search_customers']
  },
  addExpense: {
    userInput: 'Record an expense of $150 for office supplies',
    expectedIntent: 'add_expense',
    expectedEntities: ['amount', 'expense'],
    expectedActions: ['create_expense']
  },
  generateReport: {
    userInput: 'Show me how my business is doing this month',
    expectedIntent: 'generate_report',
    expectedEntities: ['date'],
    expectedActions: ['generate_financial_report']
  }
};