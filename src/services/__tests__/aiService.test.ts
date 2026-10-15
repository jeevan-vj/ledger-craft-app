import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIConversationService } from '../aiService';
import {
  mockConversationContext,
  mockUserMessage,
  mockOpenAIAnalysisResponse,
  conversationScenarios
} from '../../test/fixtures/conversationFixtures';
import {
  setupTest,
  cleanupTest,
  mockOpenAIFetch,
  expectValidEntity,
  expectValidAction,
  expectValidConfidenceScore
} from '../../test/utils/testUtils';

describe('AIConversationService', () => {
  let aiService: AIConversationService;
  let testMocks: ReturnType<typeof setupTest>;
  let originalEnv: typeof import.meta.env;

  beforeEach(() => {
    testMocks = setupTest();
    originalEnv = { ...import.meta.env };
    import.meta.env.VITE_OPENAI_API_KEY = 'test-api-key';
    aiService = new AIConversationService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupTest(testMocks);
    import.meta.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with API key from environment', () => {
      expect(aiService.isConfigured()).toBe(true);
    });

    it('should handle missing API key gracefully', () => {
      expect(() => new AIConversationService()).not.toThrow();
    });
  });

  describe('processMessage', () => {
    it('should process a create invoice message', async () => {
      const openAIResponse = {
        intent: 'create_invoice',
        entities: [
          { type: 'customer', value: 'John Smith', confidence: 0.9 },
          { type: 'service', value: 'web design', confidence: 0.8 },
          { type: 'amount', value: '$500', confidence: 0.95 }
        ],
        confidence: 0.85
      };

      mockOpenAIFetch(openAIResponse);

      const result = await aiService.processMessage(
        conversationScenarios.createInvoice.userInput,
        mockConversationContext,
        [mockUserMessage]
      );

      expect(result.intent).toBe('create_invoice');
      expect(result.entities).toHaveLength(3);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('create_invoice');
      expect(result.needsConfirmation).toBe(false);

      result.entities.forEach(expectValidEntity);
      result.actions.forEach(expectValidAction);
    });

    it('should process a find customer message', async () => {
      const openAIResponse = {
        intent: 'find_customer',
        entities: [
          { type: 'customer', value: 'Sarah', confidence: 0.9 }
        ],
        confidence: 0.9
      };

      mockOpenAIFetch(openAIResponse);

      const result = await aiService.processMessage(
        conversationScenarios.findCustomer.userInput,
        mockConversationContext,
        []
      );

      expect(result.intent).toBe('find_customer');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].type).toBe('customer');
      expect(result.actions[0].type).toBe('search_customers');
    });

    it('should process an add expense message', async () => {
      const openAIResponse = {
        intent: 'add_expense',
        entities: [
          { type: 'amount', value: '$150', confidence: 0.95 },
          { type: 'expense', value: 'office supplies', confidence: 0.8 }
        ],
        confidence: 0.85
      };

      mockOpenAIFetch(openAIResponse);

      const result = await aiService.processMessage(
        conversationScenarios.addExpense.userInput,
        mockConversationContext,
        []
      );

      expect(result.intent).toBe('add_expense');
      expect(result.entities).toHaveLength(2);
      expect(result.actions[0].type).toBe('create_expense');
    });

    it('should handle unknown intent gracefully', async () => {
      const openAIResponse = {
        intent: 'unknown',
        entities: [],
        confidence: 0.1
      };

      mockOpenAIFetch(openAIResponse);

      const result = await aiService.processMessage(
        'Random gibberish that makes no sense',
        mockConversationContext,
        []
      );

      expect(result.intent).toBe('unknown');
      expect(result.entities).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
      expect(result.message).toContain('Processing your request');
    });

    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await aiService.processMessage(
        'Create an invoice',
        mockConversationContext,
        []
      );

      expect(result.intent).toBe('create_invoice');
    });

    it('should identify missing information for invoice creation', async () => {
      const openAIResponse = {
        intent: 'create_invoice',
        entities: [
          { type: 'service', value: 'web design', confidence: 0.8 }
        ],
        confidence: 0.7
      };

      mockOpenAIFetch(openAIResponse);

      const result = await aiService.processMessage(
        'Create an invoice for web design',
        mockConversationContext,
        []
      );

      expect(result.message).toContain('Which customer is this for?');
      expect(result.actions).toHaveLength(0);
    });
  });

  describe('buildAnalysisPrompt', () => {
    it('should include business context in prompt', () => {
      const prompt = (aiService as any).buildAnalysisPrompt(mockConversationContext);

      expect(prompt).toContain('Business: Test Business');
      expect(prompt).toContain('John Smith, Sarah Johnson');
      expect(prompt).toContain('Currency: USD');
    });

    it('should handle missing business context', () => {
      const contextWithoutBusiness = {
        ...mockConversationContext,
        businessContext: undefined
      };

      const prompt = (aiService as any).buildAnalysisPrompt(contextWithoutBusiness);

      expect(prompt).toContain('Recent customers: John Smith, Sarah Johnson');
      expect(prompt).not.toContain('Business:');
    });
  });

  describe('identifyMissingInformation', () => {
    it('should identify missing customer for invoice creation', () => {
      const entities = [
        { type: 'service', value: 'web design', confidence: 0.8, resolved: false }
      ];

      const missing = (aiService as any).identifyMissingInformation(
        'create_invoice',
        entities,
        mockConversationContext
      );

      expect(missing).toContain('customer');
    });

    it('should identify missing items for invoice creation', () => {
      const entities = [
        { type: 'customer', value: 'John Smith', confidence: 0.9, resolved: true }
      ];

      const missing = (aiService as any).identifyMissingInformation(
        'create_invoice',
        entities,
        {
          ...mockConversationContext,
          currentInvoiceCreation: { step: 'item_selection', selectedItems: [] },
        }
      );

      expect(missing).toContain('items');
    });

    it('should identify missing amount for expense', () => {
      const entities = [
        { type: 'expense', value: 'office supplies', confidence: 0.8, resolved: false }
      ];

      const missing = (aiService as any).identifyMissingInformation(
        'add_expense',
        entities,
        mockConversationContext
      );

      expect(missing).toContain('amount');
    });

    it('should return empty array when all required fields present', () => {
      const entities = [
        { type: 'customer', value: 'John Smith', confidence: 0.9, resolved: true },
        { type: 'service', value: 'web design', confidence: 0.8, resolved: false }
      ];

      const missing = (aiService as any).identifyMissingInformation(
        'create_invoice',
        entities,
        mockConversationContext
      );

      expect(missing).toHaveLength(0);
    });
  });

  describe('planActions', () => {
    it('should plan create invoice action', () => {
      const entities = [
        { type: 'customer', value: 'John Smith', confidence: 0.9, resolved: true },
        { type: 'service', value: 'web design', confidence: 0.8, resolved: false },
        { type: 'amount', value: '$500', confidence: 0.95, resolved: true }
      ];

      const actions = (aiService as any).planActions(
        'create_invoice',
        entities,
        mockConversationContext
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('create_invoice');
      expect(actions[0].parameters.customer).toBe('John Smith');
      expect(actions[0].parameters.amount).toBe('$500');
    });

    it('should plan search customers action', () => {
      const entities = [
        { type: 'customer', value: 'Sarah', confidence: 0.9, resolved: false }
      ];

      const actions = (aiService as any).planActions(
        'find_customer',
        entities,
        mockConversationContext
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('search_customers');
      expect(actions[0].parameters.query).toBe('Sarah');
    });

    it('should plan create expense action', () => {
      const entities = [
        { type: 'amount', value: '$150', confidence: 0.95, resolved: true },
        { type: 'expense', value: 'office supplies', confidence: 0.8, resolved: false }
      ];

      const actions = (aiService as any).planActions(
        'add_expense',
        entities,
        mockConversationContext
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('create_expense');
      expect(actions[0].parameters.amount).toBe('$150');
      expect(actions[0].parameters.description).toBe('office supplies');
    });
  });

  describe('shouldConfirmAction', () => {
    it('should require confirmation for sensitive actions', () => {
      const needsConfirmation = (aiService as any).shouldConfirmAction(
        'send_invoice',
        [{ type: 'send_invoice', status: 'pending' }]
      );

      expect(needsConfirmation).toBe(true);
    });

    it('should require confirmation for create actions', () => {
      const needsConfirmation = (aiService as any).shouldConfirmAction(
        'add_expense',
        [{ type: 'create_expense', status: 'pending', parameters: { amount: '1500' } }]
      );

      expect(needsConfirmation).toBe(true);
    });

    it('should not require confirmation for safe actions', () => {
      const needsConfirmation = (aiService as any).shouldConfirmAction(
        'find_customer',
        [{ type: 'search_customers', status: 'pending' }]
      );

      expect(needsConfirmation).toBe(false);
    });
  });

  describe('generateConfirmationMessage', () => {
    it('should generate invoice confirmation message', () => {
      const entities = [
        { type: 'customer', value: 'John Smith', confidence: 0.9, resolved: true },
        { type: 'service', value: 'web design', confidence: 0.8, resolved: false }
      ];

      const actions = [
        {
          type: 'create_invoice',
          parameters: { customer: 'John Smith', items: ['web design'] },
          status: 'pending'
        }
      ];

      const message = (aiService as any).generateConfirmationMessage(
        'create_invoice',
        entities,
        actions
      );

      expect(message).toContain('John Smith');
      expect(message).toContain('web design');
      expect(message).toContain('Should I proceed?');
    });

    it('should generate expense confirmation message', () => {
      const entities = [
        { type: 'amount', value: '$150', confidence: 0.95, resolved: true },
        { type: 'expense', value: 'office supplies', confidence: 0.8, resolved: false }
      ];

      const actions = [
        {
          type: 'create_expense',
          parameters: { amount: '$150', description: 'office supplies' },
          status: 'pending'
        }
      ];

      const message = (aiService as any).generateConfirmationMessage(
        'add_expense',
        entities,
        actions
      );

      expect(message).toContain('$150');
      expect(message).toContain('office supplies');
      expect(message).toContain('Is this correct?');
    });
  });

  describe('getSuggestedActions', () => {
    it('should return appropriate suggestions for create invoice', () => {
      const suggestions = (aiService as any).getSuggestedActions(
        'create_invoice',
        []
      );

      expect(suggestions).toContain('Send invoice via email');
      expect(suggestions).toContain('Preview invoice');
      expect(suggestions).toContain('Save as draft');
    });

    it('should return appropriate suggestions for find customer', () => {
      const suggestions = (aiService as any).getSuggestedActions(
        'find_customer',
        []
      );

      expect(suggestions).toContain('Create new invoice');
      expect(suggestions).toContain('View customer details');
      expect(suggestions).toContain('Edit customer');
    });

    it('should return default suggestions for unknown intent', () => {
      const suggestions = (aiService as any).getSuggestedActions(
        'unknown',
        []
      );

      expect(suggestions).toContain('Ask for help');
      expect(suggestions).toContain('Try a different request');
    });
  });

  describe('isConfigured', () => {
    it('should return true when API key is configured', () => {
      expect(aiService.isConfigured()).toBe(true);
    });

    it('should return false when API key is missing', () => {
      const service = Object.assign(new AIConversationService(), { apiKey: '' });
      expect(service.isConfigured()).toBe(false);
    });
  });
});