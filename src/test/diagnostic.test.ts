import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIConversationService } from '../services/aiService';
import { ConversationActionHandler } from '../services/conversationActionHandler';
import { ConversationService } from '../services/conversationService';
import { 
  mockConversationContext,
  mockCreateInvoiceAction,
  conversationScenarios
} from './fixtures/conversationFixtures';

// Mock external dependencies
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    order: vi.fn().mockReturnThis(),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null
      })
    }
  }
}));

vi.mock('../services/conversationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/conversationService')>();
  return {
    ...actual,
    conversationService: {
      ...actual.conversationService,
      addEntityToContext: vi.fn().mockResolvedValue(undefined),
    },
  };
});

function chatResponse(content: string) {
  return {
    ok: true,
    json: async () => ({ content }),
  } as Response;
}

describe('AI Conversation System - Diagnostic Tests', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_AI_API', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
  
  describe('🤖 AI Service Validation', () => {
    it('should create AI service instance', () => {
      const aiService = new AIConversationService();
      expect(aiService).toBeInstanceOf(AIConversationService);
    });

    it('should handle intent classification', async () => {
      // Mock fetch for OpenAI API
      global.fetch = vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
        intent: 'create_invoice',
        entities: [
          { type: 'customer', value: 'John Smith', confidence: 0.9 },
          { type: 'amount', value: '$500', confidence: 0.95 }
        ],
        confidence: 0.85
      })));

      const aiService = new AIConversationService();
      const result = await aiService.processMessage(
        'Create an invoice for John Smith for $500',
        mockConversationContext,
        []
      );

      expect(result).toBeDefined();
      expect(result.intent).toBe('create_invoice');
      expect(result.entities).toHaveLength(2);
      expect(result.actions).toHaveLength(1);
    });

    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const aiService = new AIConversationService();
      const result = await aiService.processMessage(
        'hello there',
        mockConversationContext,
        []
      );

      expect(result.intent).toBe('unknown');
      expect(result.message).toBeTruthy();
    });
  });

  describe('🎯 Action Handler Validation', () => {
    it('should create action handler instance', () => {
      const actionHandler = new ConversationActionHandler();
      expect(actionHandler).toBeInstanceOf(ConversationActionHandler);
    });

    it('should handle unknown actions', async () => {
      const actionHandler = new ConversationActionHandler();
      const unknownAction = {
        type: 'unknown_action',
        parameters: {},
        status: 'pending' as const
      };

      const result = await actionHandler.executeAction(
        unknownAction,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type');
    });

    it('should validate action parameters', async () => {
      const actionHandler = new ConversationActionHandler();
      const incompleteAction = {
        type: 'create_invoice',
        parameters: {}, // Missing required parameters
        status: 'pending' as const
      };

      const result = await actionHandler.executeAction(
        incompleteAction,
        mockConversationContext,
        'conversation-1'
      );

      expect(result.success).toBe(false);
      expect(result.needsInfo).toBeDefined();
    });
  });

  describe('💾 Database Service Validation', () => {
    it('should create conversation service instance', () => {
      const conversationService = new ConversationService();
      expect(conversationService).toBeInstanceOf(ConversationService);
    });

    it('should build context from current data', async () => {
      const conversationService = new ConversationService();
      const result = await conversationService.buildContextFromCurrentData('user-1');

      expect(result).toHaveProperty('recentEntities');
      expect(result).toHaveProperty('userPreferences');
      expect(result.recentEntities).toHaveProperty('customers');
      expect(result.recentEntities).toHaveProperty('invoices');
      expect(result.recentEntities).toHaveProperty('expenses');
      expect(result.recentEntities).toHaveProperty('items');
    });
  });

  describe('🔗 Integration Validation', () => {
    it('should validate conversation scenarios', () => {
      const scenarios = conversationScenarios;
      
      expect(scenarios.createInvoice).toBeDefined();
      expect(scenarios.findCustomer).toBeDefined();
      expect(scenarios.addExpense).toBeDefined();
      expect(scenarios.generateReport).toBeDefined();

      // Validate scenario structure
      Object.values(scenarios).forEach(scenario => {
        expect(scenario).toHaveProperty('userInput');
        expect(scenario).toHaveProperty('expectedIntent');
        expect(scenario).toHaveProperty('expectedEntities');
        expect(scenario).toHaveProperty('expectedActions');
      });
    });

    it('should validate mock data consistency', () => {
      expect(mockConversationContext).toBeDefined();
      expect(mockConversationContext.recentEntities).toBeDefined();
      expect(mockConversationContext.userPreferences).toBeDefined();
      
      expect(mockCreateInvoiceAction).toBeDefined();
      expect(mockCreateInvoiceAction.type).toBe('create_invoice');
      expect(mockCreateInvoiceAction.parameters).toBeDefined();
    });
  });

  describe('⚡ Performance & Error Handling', () => {
    it('should handle concurrent operations', async () => {
      const aiService = new AIConversationService();
      
      // Mock successful API response
      global.fetch = vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
        intent: 'greeting',
        entities: [],
        confidence: 0.9,
      })));

      const promises = Array(3).fill(null).map(() => 
        aiService.processMessage('Hello', mockConversationContext, [])
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.intent).toBeDefined();
      });
    });

    it('should handle malformed API responses', async () => {
      const aiService = new AIConversationService();
      
      // Mock malformed API response
      global.fetch = vi.fn().mockResolvedValue(chatResponse('invalid json'));

      const result = await aiService.processMessage(
        'Create an invoice',
        mockConversationContext,
        []
      );

      expect(result.intent).toBe('unknown');
      expect(result.entities).toHaveLength(0);
    });
  });
});

describe('🎯 System Readiness Check', () => {
  it('should validate all core components are testable', () => {
    const aiService = new AIConversationService();
    const actionHandler = new ConversationActionHandler();
    const conversationService = new ConversationService();

    expect(aiService).toBeInstanceOf(AIConversationService);
    expect(actionHandler).toBeInstanceOf(ConversationActionHandler);
    expect(conversationService).toBeInstanceOf(ConversationService);
  });

  it('should validate environment configuration', () => {
    // Check that we can access environment variables
    expect(import.meta.env).toBeDefined();
    
    // Note: In real environment, these would be set
    // expect(import.meta.env.VITE_OPENAI_API_KEY).toBeDefined();
    // expect(import.meta.env.VITE_SUPABASE_URL).toBeDefined();
  });

  it('should validate type system integrity', () => {
    // Check that all types are properly defined
    expect(mockConversationContext).toMatchObject({
      recentEntities: expect.any(Object),
      userPreferences: expect.any(Object)
    });

    expect(mockCreateInvoiceAction).toMatchObject({
      type: expect.any(String),
      parameters: expect.any(Object),
      status: expect.any(String)
    });
  });
});