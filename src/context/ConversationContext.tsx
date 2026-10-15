import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { 
  ConversationSession, 
  ConversationMessage, 
  ConversationContext as ConversationContextType,
  AIResponse,
  ConversationAction 
} from '../types';
import { aiService } from '../services/aiService';
import { conversationService } from '../services/conversationService';
import { conversationActionHandler } from '../services/conversationActionHandler';
import { useAuth } from './StableAuthContext';
import { useToast } from '../hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface ConversationProviderType {
  // Current conversation state
  currentConversation: ConversationSession | null;
  recentConversations: ConversationSession[];
  isLoading: boolean;
  isProcessing: boolean;
  
  // Chat interface state
  isChatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  
  // Conversation management
  createNewConversation: () => Promise<ConversationSession>;
  loadConversation: (conversationId: string) => Promise<void>;
  getRecentConversations: () => Promise<void>;
  
  // Message handling
  sendMessage: (message: string) => Promise<void>;
  confirmAction: (actionId: string) => Promise<void>;
  rejectAction: (actionId: string) => Promise<void>;
  
  // Conversation lifecycle
  endConversation: () => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
}

const ConversationContext = createContext<ConversationProviderType | undefined>(undefined);

export const useConversation = () => {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  return context;
};

interface ConversationProviderProps {
  children: ReactNode;
}

export const ConversationProvider: React.FC<ConversationProviderProps> = ({ children }) => {
  const [currentConversation, setCurrentConversation] = useState<ConversationSession | null>(null);
  const [recentConversations, setRecentConversations] = useState<ConversationSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [pendingActions, setPendingActions] = useState<Map<string, ConversationAction>>(new Map());

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const conversationsLoadedRef = useRef<string | null>(null);
  
  // Use localStorage to persist conversation loading state across HMR reloads
  const getConversationLoadedKey = (userId: string) => `conversations_loaded_${userId}`;
  const areConversationsLoaded = (userId: string) => {
    return localStorage.getItem(getConversationLoadedKey(userId)) === 'true';
  };
  const setConversationsLoaded = (userId: string) => {
    localStorage.setItem(getConversationLoadedKey(userId), 'true');
  };
  const clearConversationsLoaded = () => {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('conversations_loaded_')) {
        localStorage.removeItem(key);
      }
    });
  };

  const getRecentConversations = async (): Promise<void> => {
    if (!user) return;
    
    try {
      const conversations = await conversationService.getUserConversations(user.id);
      setRecentConversations(conversations);
    } catch (error) {
      console.error('Error fetching recent conversations:', error);
    }
  };

  // Load recent conversations on mount
  useEffect(() => {
    const conversationsAlreadyLoaded = user ? areConversationsLoaded(user.id) : false;
    
    if (user && conversationsLoadedRef.current !== user.id && !conversationsAlreadyLoaded) {
      console.log('ConversationContext: Loading conversations for user:', user.id);
      conversationsLoadedRef.current = user.id;
      setConversationsLoaded(user.id);
      getRecentConversations();
    } else if (!user) {
      conversationsLoadedRef.current = null;
      clearConversationsLoaded();
    } else if (user && conversationsAlreadyLoaded) {
      console.log('ConversationContext: Conversations already loaded for user, skipping');
      conversationsLoadedRef.current = user.id;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const createNewConversation = async (): Promise<ConversationSession> => {
    if (!user) throw new Error('User not authenticated');
    
    setIsLoading(true);
    try {
      // Build initial context from current user data
      const initialContext = await conversationService.buildContextFromCurrentData(user.id);
      
      const conversation = await conversationService.createConversation(user.id, initialContext);
      
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
        setCurrentConversation(fullConversation);
        setRecentConversations(prev => [fullConversation, ...prev.slice(0, 9)]);
      }

      return conversation;
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to start new conversation',
        variant: 'destructive'
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversation = async (conversationId: string): Promise<void> => {
    setIsLoading(true);
    try {
      const conversation = await conversationService.getConversation(conversationId);
      if (conversation) {
        setCurrentConversation(conversation);
        setIsChatOpen(true);
      } else {
        throw new Error('Conversation not found');
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to load conversation',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (message: string): Promise<void> => {
    if (!currentConversation || !user) {
      // Create new conversation if none exists
      if (!currentConversation && user) {
        await createNewConversation();
        // Retry sending message after conversation is created
        return sendMessage(message);
      }
      return;
    }

    setIsProcessing(true);
    try {
      // Add user message
      const userMessage = await conversationService.addMessage(
        currentConversation.id,
        'user',
        message
      );

      // Update current conversation with user message
      setCurrentConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, userMessage]
      } : null);

      // Check if this is an invoice creation flow
      let aiResponse;
      if (currentConversation.context.currentInvoiceCreation || 
          message.toLowerCase().includes('create') && message.toLowerCase().includes('invoice')) {
        aiResponse = await aiService.processInvoiceCreationFlow(
          message,
          currentConversation.context,
          currentConversation.messages
        );
      } else {
        aiResponse = await aiService.processMessage(
          message,
          currentConversation.context,
          currentConversation.messages
        );
      }

      // Add assistant message
      const assistantMessage = await conversationService.addMessage(
        currentConversation.id,
        'assistant',
        aiResponse.message,
        {
          intent: aiResponse.intent,
          entities: aiResponse.entities,
          actions: aiResponse.actions,
          confidence: 0.8,
          suggestedActions: aiResponse.suggestedActions
        }
      );

      // Update conversation context if provided
      if (aiResponse.context) {
        await conversationService.updateConversationContext(
          currentConversation.id,
          aiResponse.context
        );
      }

      // Store pending actions
      aiResponse.actions.forEach(action => {
        if (action.status === 'pending') {
          setPendingActions(prev => new Map(prev).set(action.type, action));
        }
      });

      // Update current conversation
      setCurrentConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, assistantMessage],
        context: { ...prev.context, ...aiResponse.context }
      } : null);

      // Auto-execute non-sensitive actions
      if (!aiResponse.needsConfirmation && aiResponse.actions.length > 0) {
        for (const action of aiResponse.actions) {
          if (action.status === 'pending') {
            await executeAction(action);
          }
        }
      }

      // Update conversation title if this is the first user message
      if (currentConversation.messages.filter(m => m.role === 'user').length === 1) {
        const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
        await conversationService.updateConversationTitle(currentConversation.id, title);
        setCurrentConversation(prev => prev ? { ...prev, title } : null);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add error message
      const errorMessage = await conversationService.addMessage(
        currentConversation.id,
        'assistant',
        "I'm sorry, I encountered an error processing your request. Please try again.",
        { intent: 'help' }
      );

      setCurrentConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, errorMessage]
      } : null);

      toast({
        title: 'Error',
        description: 'Failed to process your message',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmAction = async (actionId: string): Promise<void> => {
    const action = pendingActions.get(actionId);
    if (!action || !currentConversation) return;

    setIsProcessing(true);
    try {
      await executeAction(action);
      setPendingActions(prev => {
        const newMap = new Map(prev);
        newMap.delete(actionId);
        return newMap;
      });
    } catch (error) {
      console.error('Error confirming action:', error);
      toast({
        title: 'Error',
        description: 'Failed to execute action',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const rejectAction = async (actionId: string): Promise<void> => {
    const action = pendingActions.get(actionId);
    if (!action || !currentConversation) return;

    try {
      // Add rejection message
      await conversationService.addMessage(
        currentConversation.id,
        'assistant',
        "Understood, I won't proceed with that action. Is there anything else I can help you with?",
        { intent: 'clarification' }
      );

      setPendingActions(prev => {
        const newMap = new Map(prev);
        newMap.delete(actionId);
        return newMap;
      });

      // Reload conversation
      const updatedConversation = await conversationService.getConversation(currentConversation.id);
      if (updatedConversation) {
        setCurrentConversation(updatedConversation);
      }
    } catch (error) {
      console.error('Error rejecting action:', error);
    }
  };

  const executeAction = async (action: ConversationAction): Promise<void> => {
    if (!currentConversation) return;

    try {
      const result = await conversationActionHandler.executeAction(
        action,
        currentConversation.context,
        currentConversation.id
      );

      let responseMessage: string;
      let responseData: any = null;

      if (result.success) {
        responseMessage = generateSuccessMessage(action.type, result.data);
        responseData = result.data;
        
        // Handle navigation action
        if (action.type === 'navigate_to_invoice' && result.data?.editUrl) {
          setTimeout(() => {
            navigate(result.data.editUrl);
          }, 500);
        }
        
        toast({
          title: 'Success',
          description: `${action.type.replace('_', ' ')} completed successfully`,
        });
      } else {
        responseMessage = result.error || 'Action failed';
        if (result.needsInfo) {
          responseMessage += ` I need more information about: ${result.needsInfo}`;
        }
      }

      // Add result message
      const resultMessage = await conversationService.addMessage(
        currentConversation.id,
        'assistant',
        responseMessage,
        {
          intent: action.type as any,
          data: responseData,
          suggestedActions: result.suggestions
        }
      );

      // Update conversation
      setCurrentConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, resultMessage]
      } : null);

    } catch (error) {
      console.error('Error executing action:', error);
      throw error;
    }
  };

  const generateSuccessMessage = (actionType: string, data: any): string => {
    switch (actionType) {
      case 'create_invoice':
        return `Great! I've created invoice ${data.invoiceNumber} for ${data.customerName}. Total amount: ${data.currency} ${data.total}`;
      case 'navigate_to_invoice':
        return `Invoice created successfully! You can view and edit it now.`;
      case 'create_customer':
        return `Perfect! I've added ${data.name} as a new customer.`;
      case 'create_expense':
        return `I've recorded your expense of ${data.currency} ${data.amount} for "${data.description}".`;
      case 'search_customers':
        return `I found ${data.count} customer(s) matching your search.`;
      case 'generate_financial_report':
        const metrics = data.metrics;
        return `Here's your financial summary for ${data.period}:\n• Revenue: ${data.currency} ${metrics.totalRevenue}\n• Expenses: ${data.currency} ${metrics.totalExpenses}\n• Profit: ${data.currency} ${metrics.profit} (${metrics.profitMargin}% margin)`;
      default:
        return 'Action completed successfully!';
    }
  };

  const endConversation = async (): Promise<void> => {
    if (!currentConversation) return;

    try {
      await conversationService.updateConversationStatus(currentConversation.id, 'completed');
      setCurrentConversation(null);
      setIsChatOpen(false);
      setPendingActions(new Map());
    } catch (error) {
      console.error('Error ending conversation:', error);
    }
  };

  const deleteConversation = async (conversationId: string): Promise<void> => {
    try {
      await conversationService.deleteConversation(conversationId);
      setRecentConversations(prev => prev.filter(c => c.id !== conversationId));
      
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
        setIsChatOpen(false);
      }
      
      toast({
        title: 'Success',
        description: 'Conversation deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive'
      });
    }
  };

  const setChatOpen = (open: boolean) => {
    setIsChatOpen(open);
    
    // Create new conversation when opening chat if none exists
    if (open && !currentConversation && user) {
      createNewConversation();
    }
  };

  const value: ConversationProviderType = {
    currentConversation,
    recentConversations,
    isLoading,
    isProcessing,
    isChatOpen,
    setChatOpen,
    createNewConversation,
    loadConversation,
    getRecentConversations,
    sendMessage,
    confirmAction,
    rejectAction,
    endConversation,
    deleteConversation
  };

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
};