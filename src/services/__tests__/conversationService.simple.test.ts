import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationService } from '../conversationService';
import { mockConversationContext } from '../../test/fixtures/conversationFixtures';

// Mock Supabase with factory function
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    limit: vi.fn(),
    order: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null
      })
    }
  }
}));

// Import the mocked supabase
import { supabase } from '@/integrations/supabase/client';
const mockSupabaseClient = supabase as unknown as ReturnType<typeof import('../../test/utils/testUtils').createMockSupabaseClient>;

describe('ConversationService - Simple Test', () => {
  let conversationService: ConversationService;

  beforeEach(() => {
    conversationService = new ConversationService();
    vi.clearAllMocks();
    
    // Setup method chaining
    mockSupabaseClient.from.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.select.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.insert.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.update.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.delete.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.eq.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.limit.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.order.mockReturnValue(mockSupabaseClient);
  });

  it('should create conversation service instance', () => {
    expect(conversationService).toBeInstanceOf(ConversationService);
  });

  it('should attempt to create conversation', async () => {
    const mockResponse = {
      id: 'conversation-1',
      user_id: 'user-1',
      title: null,
      context: mockConversationContext,
      status: 'active',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    };

    // Mock the final result
    mockSupabaseClient.single.mockResolvedValue({
      data: mockResponse,
      error: null
    });

    const result = await conversationService.createConversation('user-1');

    expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations');
    expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        status: 'active'
      })
    );
    expect(result).toBeDefined();
    expect(result.id).toBe('conversation-1');
    expect(result.userId).toBe('user-1');
  });

  it('should handle errors gracefully', async () => {
    mockSupabaseClient.single.mockResolvedValue({
      data: null,
      error: { message: 'Database error' }
    });

    await expect(
      conversationService.createConversation('user-1')
    ).rejects.toThrow('Failed to create conversation: Database error');
  });

  it('should build context from current data', async () => {
    // Mock all the database calls to return empty arrays
    mockSupabaseClient.limit.mockResolvedValue({ data: [], error: null });

    const result = await conversationService.buildContextFromCurrentData('user-1');

    expect(result).toHaveProperty('recentEntities');
    expect(result).toHaveProperty('userPreferences');
    expect(result.recentEntities.customers).toEqual([]);
    expect(result.recentEntities.invoices).toEqual([]);
    expect(result.recentEntities.expenses).toEqual([]);
    expect(result.recentEntities.items).toEqual([]);
  });
});