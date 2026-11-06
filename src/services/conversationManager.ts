/**
 * Stable Conversation Manager - Singleton pattern for conversation management
 * This is completely independent of React lifecycle and HMR
 */

import { ConversationSession, ConversationMessage, ConversationAction } from '../types';
import { conversationService } from '../services/conversationService';
import { aiService } from './aiService';

interface ConversationState {
  currentConversation: ConversationSession | null;
  recentConversations: ConversationSession[];
  isLoading: boolean;
  isProcessing: boolean;
  isChatOpen: boolean;
  pendingActions: Map<string, ConversationAction>;
}

type ConversationSubscriber = (state: ConversationState) => void;

class ConversationManager {
  private static instance: ConversationManager;
  private state: ConversationState = {
    currentConversation: null,
    recentConversations: [],
    isLoading: false,
    isProcessing: false,
    isChatOpen: false,
    pendingActions: new Map()
  };

  private subscribers: Set<ConversationSubscriber> = new Set();
  private initialized = false;
  private currentUserId: string | null = null;

  private constructor() {}

  static getInstance(): ConversationManager {
    if (!ConversationManager.instance) {
      ConversationManager.instance = new ConversationManager();
    }
    return ConversationManager.instance;
  }

  // Subscribe to state changes
  subscribe(callback: ConversationSubscriber): () => void {
    this.subscribers.add(callback);
    // Immediately call with current state
    callback(this.state);
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // Notify all subscribers
  private notify() {
    this.subscribers.forEach(callback => {
      callback(this.state);
    });
  }

  // Initialize conversations for a user (only once per user)
  async initialize(userId: string): Promise<void> {
    if (this.initialized && this.currentUserId === userId) {
      console.log('ConversationManager: Already initialized for user', userId);
      return;
    }

    if (this.currentUserId !== userId) {
      console.log('ConversationManager: New user, resetting conversations');
      this.reset();
    }

    console.log('ConversationManager: Initializing conversations for user', userId);
    this.currentUserId = userId;
    this.initialized = true;

    await this.loadRecentConversations();
  }

  // Reset conversations (for user logout)
  reset(): void {
    console.log('ConversationManager: Resetting conversations');
    this.state = {
      currentConversation: null,
      recentConversations: [],
      isLoading: false,
      isProcessing: false,
      isChatOpen: false,
      pendingActions: new Map()
    };
    this.initialized = false;
    this.currentUserId = null;
    this.notify();
  }

  // Load recent conversations
  async loadRecentConversations(): Promise<void> {
    if (!this.currentUserId) return;
    
    try {
      this.state.isLoading = true;
      this.notify();

      const conversations = await conversationService.getUserConversations(this.currentUserId);
      this.state.recentConversations = conversations;
    } catch (error) {
      console.error('ConversationManager: Error loading recent conversations:', error);
    } finally {
      this.state.isLoading = false;
      this.notify();
    }
  }

  // Create new conversation
  async createNewConversation(): Promise<ConversationSession> {
    if (!this.currentUserId) throw new Error('User not authenticated');
    
    this.state.isLoading = true;
    this.notify();

    try {
      // Build initial context from current user data
      const initialContext = await conversationService.buildContextFromCurrentData(this.currentUserId);
      
      const conversation = await conversationService.createConversation(this.currentUserId, initialContext);
      
      // Add welcome message
      await conversationService.addMessage(
        conversation.id,
        'assistant',
        "Hello! I'm your AI assistant for EasyBizInvoice. I can help you create invoices, manage customers, track expenses, and generate reports. What would you like to do today?",
        {
          intent: 'greeting',
          suggestedActions: [
            'Create an invoice',
            'Find a customer', 
            'Add an expense',
            'Show me analytics',
            'Help me get started'
          ]
        }
      );

      // Reload conversation with messages
      const fullConversation = await conversationService.getConversation(conversation.id);
      if (fullConversation) {
        this.state.currentConversation = fullConversation;
        this.state.recentConversations = [fullConversation, ...this.state.recentConversations.slice(0, 9)];
      }

      return conversation;
    } catch (error) {
      console.error('ConversationManager: Error creating conversation:', error);
      throw error;
    } finally {
      this.state.isLoading = false;
      this.notify();
    }
  }

  // Load specific conversation
  async loadConversation(conversationId: string): Promise<void> {
    this.state.isLoading = true;
    this.notify();

    try {
      const conversation = await conversationService.getConversation(conversationId);
      if (conversation) {
        this.state.currentConversation = conversation;
      }
    } catch (error) {
      console.error('ConversationManager: Error loading conversation:', error);
      throw error;
    } finally {
      this.state.isLoading = false;
      this.notify();
    }
  }

  // Send message
  async sendMessage(message: string): Promise<void> {
    if (!this.state.currentConversation) {
      throw new Error('No active conversation');
    }

    this.state.isProcessing = true;
    this.notify();

    try {
      // Add user message
      await conversationService.addMessage(
        this.state.currentConversation.id,
        'user',
        message
      );

      // Process with AI and get response
      const response = await aiService.processMessage(
        message, this.state.currentConversation.context, this.state.currentConversation.messages,
      );

      // Add AI response
      await conversationService.addMessage(
        this.state.currentConversation.id,
        'assistant',
        response.message,
        { intent: response.intent, entities: response.entities, actions: response.actions, suggestedActions: response.suggestedActions }
      );

      // Reload conversation to get updated messages
      await this.loadConversation(this.state.currentConversation.id);

    } catch (error) {
      console.error('ConversationManager: Error sending message:', error);
      throw error;
    } finally {
      this.state.isProcessing = false;
      this.notify();
    }
  }

  // UI state management
  setChatOpen(open: boolean): void {
    this.state.isChatOpen = open;
    this.notify();
  }

  // End conversation
  async endConversation(): Promise<void> {
    if (!this.state.currentConversation) return;

    try {
      await conversationService.updateConversationStatus(this.state.currentConversation.id, 'completed');
      this.state.currentConversation = null;
      await this.loadRecentConversations();
    } catch (error) {
      console.error('ConversationManager: Error ending conversation:', error);
      throw error;
    }
  }

  // Delete conversation
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      await conversationService.deleteConversation(conversationId);
      
      // Remove from recent conversations
      this.state.recentConversations = this.state.recentConversations.filter(
        conv => conv.id !== conversationId
      );
      
      // Clear current conversation if it was deleted
      if (this.state.currentConversation?.id === conversationId) {
        this.state.currentConversation = null;
      }
      
      this.notify();
    } catch (error) {
      console.error('ConversationManager: Error deleting conversation:', error);
      throw error;
    }
  }

  // Action management
  async confirmAction(actionId: string): Promise<void> {
    const action = this.state.pendingActions.get(actionId);
    if (!action) return;

    try {
      // Execute the action
      // Implementation depends on your action handler
      this.state.pendingActions.delete(actionId);
      this.notify();
    } catch (error) {
      console.error('ConversationManager: Error confirming action:', error);
      throw error;
    }
  }

  async rejectAction(actionId: string): Promise<void> {
    this.state.pendingActions.delete(actionId);
    this.notify();
  }

  // Getters
  getState(): ConversationState {
    return { ...this.state };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }
}

export const conversationManager = ConversationManager.getInstance();
