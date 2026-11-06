import { beforeEach, expect, it, vi } from 'vitest';
import { conversationManager } from '../conversationManager';
import { conversationService } from '../conversationService';
import { aiService } from '../aiService';
import { mockConversationSession } from '@/test/fixtures/conversationFixtures';
vi.mock('../conversationService', () => ({ conversationService: { getUserConversations: vi.fn(async () => []), buildContextFromCurrentData: vi.fn(async () => mockConversationSession.context), createConversation: vi.fn(), addMessage: vi.fn(), getConversation: vi.fn(), updateConversationStatus: vi.fn() } }));
vi.mock('../aiService', () => ({ aiService: { processMessage: vi.fn() } }));
beforeEach(async () => {
 vi.clearAllMocks(); conversationManager.reset();
 vi.mocked(conversationService.createConversation).mockResolvedValue(mockConversationSession);
 vi.mocked(conversationService.getConversation).mockResolvedValue(mockConversationSession);
 vi.mocked(aiService.processMessage).mockResolvedValue({ message: 'How can I help?', intent: 'help', actions: [], entities: [], needsConfirmation: false });
 await conversationManager.initialize('user-1'); await conversationManager.createNewConversation();
});
it('uses the existing server-backed AI service rather than a nonexistent conversation method', async () => {
 await conversationManager.sendMessage('Help');
 expect(aiService.processMessage).toHaveBeenCalledWith('Help', mockConversationSession.context, mockConversationSession.messages);
 expect(conversationService.addMessage).toHaveBeenLastCalledWith(mockConversationSession.id, 'assistant', 'How can I help?', expect.objectContaining({ intent: 'help' }));
});
it('ends a conversation through the existing status mutation', async () => {
 await conversationManager.endConversation();
 expect(conversationService.updateConversationStatus).toHaveBeenCalledWith(mockConversationSession.id, 'completed');
 expect(conversationManager.getState().currentConversation).toBeNull();
});
