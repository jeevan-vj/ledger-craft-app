import { vi } from 'vitest';
import { ConversationSession, ConversationMessage } from '../../types';

// Mock Supabase Client
export const createMockSupabaseClient = () => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null
      })
    }
  };

  return mockSupabase;
};

// Mock OpenAI Fetch Response
export const mockOpenAIFetch = (response: any) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      content: JSON.stringify(response),
    }),
  } as Response);
};

// Mock Environment Variables
export const mockEnvVars = {
  VITE_OPENAI_API_KEY: 'test-openai-key',
  VITE_SUPABASE_URL: 'https://test.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key'
};

// Test Helpers
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

export const createSuccessResponse = <T>(data: T) => ({
  data,
  error: null
});

export const createErrorResponse = (message: string) => ({
  data: null,
  error: { message }
});

// Mock Date for consistent testing
export const mockDate = (dateString: string) => {
  const mockDate = new Date(dateString);
  vi.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
  return mockDate;
};

// Mock Console for Testing
export const mockConsole = () => {
  const originalConsole = { ...console };
  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();
  
  return {
    restore: () => {
      Object.assign(console, originalConsole);
    }
  };
};

// Custom Matchers
export const expectToBeValidUUID = (value: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  expect(value).toMatch(uuidRegex);
};

export const expectToBeValidTimestamp = (value: string) => {
  const date = new Date(value);
  expect(date).toBeInstanceOf(Date);
  expect(date.getTime()).not.toBeNaN();
};

// Conversation Test Helpers
export const expectValidConversation = (conversation: ConversationSession) => {
  expect(conversation).toHaveProperty('id');
  expect(conversation).toHaveProperty('userId');
  expect(conversation).toHaveProperty('messages');
  expect(conversation).toHaveProperty('context');
  expect(conversation).toHaveProperty('status');
  expect(conversation).toHaveProperty('createdAt');
  expect(conversation).toHaveProperty('updatedAt');
  
  expectToBeValidUUID(conversation.id);
  expectToBeValidUUID(conversation.userId);
  expectToBeValidTimestamp(conversation.createdAt);
  expectToBeValidTimestamp(conversation.updatedAt);
  
  expect(['active', 'completed', 'paused']).toContain(conversation.status);
};

export const expectValidMessage = (message: ConversationMessage) => {
  expect(message).toHaveProperty('id');
  expect(message).toHaveProperty('conversationId');
  expect(message).toHaveProperty('role');
  expect(message).toHaveProperty('content');
  expect(message).toHaveProperty('timestamp');
  
  expectToBeValidUUID(message.id);
  expectToBeValidUUID(message.conversationId);
  
  expect(['user', 'assistant', 'system']).toContain(message.role);
  expect(typeof message.content).toBe('string');
  expect(message.content.length).toBeGreaterThan(0);
  expect(message.timestamp).toBeInstanceOf(Date);
};

// Mock Network Delay
export const mockNetworkDelay = (ms: number = 100) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Error Testing Helpers
export const expectAsyncError = async (promise: Promise<any>, expectedMessage?: string) => {
  try {
    await promise;
    throw new Error('Expected promise to reject');
  } catch (error) {
    if (expectedMessage) {
      expect(error.message).toContain(expectedMessage);
    }
    return error;
  }
};

// Mock Storage
export const mockLocalStorage = () => {
  const store: Record<string, string> = {};
  
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    get store() {
      return { ...store };
    }
  };
};

// Confidence Score Helpers
export const expectValidConfidenceScore = (score: number) => {
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(1);
};

// Entity Validation
export const expectValidEntity = (entity: any) => {
  expect(entity).toHaveProperty('type');
  expect(entity).toHaveProperty('value');
  expect(entity).toHaveProperty('confidence');
  
  expect(typeof entity.type).toBe('string');
  expect(typeof entity.value).toBe('string');
  expectValidConfidenceScore(entity.confidence);
};

// Action Validation
export const expectValidAction = (action: any) => {
  expect(action).toHaveProperty('type');
  expect(action).toHaveProperty('parameters');
  expect(action).toHaveProperty('status');
  
  expect(typeof action.type).toBe('string');
  expect(typeof action.parameters).toBe('object');
  expect(['pending', 'in_progress', 'completed', 'failed']).toContain(action.status);
};

// Setup function for tests
export const setupTest = () => {
  // Clear all mocks before each test
  vi.clearAllMocks();
  
  // Reset fetch mock
  global.fetch = vi.fn();
  
  // Reset environment variables
  Object.keys(mockEnvVars).forEach(key => {
    import.meta.env[key] = mockEnvVars[key as keyof typeof mockEnvVars];
  });
  
  return {
    mockSupabase: createMockSupabaseClient(),
    mockConsole: mockConsole()
  };
};

// Cleanup function for tests
export const cleanupTest = (mocks: ReturnType<typeof setupTest>) => {
  mocks.mockConsole.restore();
  vi.restoreAllMocks();
};