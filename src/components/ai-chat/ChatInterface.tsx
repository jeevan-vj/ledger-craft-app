import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff, X, MessageCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { ConversationMessage, ConversationSession } from '../../types';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { ActionConfirmation } from './ActionConfirmation';
import { cn } from '../../lib/utils';

interface ChatInterfaceProps {
  conversation: ConversationSession | null;
  onSendMessage: (message: string) => Promise<void>;
  onConfirmAction: (actionId: string) => Promise<void>;
  onRejectAction: (actionId: string) => Promise<void>;
  isProcessing: boolean;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

export function ChatInterface({
  conversation,
  onSendMessage,
  onConfirmAction,
  onRejectAction,
  isProcessing,
  isOpen,
  onToggle,
  className
}: ChatInterfaceProps) {
  const [message, setMessage] = useState('');
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // FAB position and drag state
  const getInitialFabPosition = () => {
    if (typeof window !== 'undefined') {
      return {
        x: window.innerWidth - 64 - 24, // 24px from right
        y: window.innerHeight - 64 - 24, // 24px from bottom
      };
    }
    return { x: 24, y: 24 };
  };
  const [fabPosition, setFabPosition] = useState(getInitialFabPosition);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const fabRef = useRef<HTMLButtonElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.messages]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // Keep FAB within bounds on resize
  useEffect(() => {
    function handleResize() {
      setFabPosition((pos) => {
        const maxX = window.innerWidth - 72;
        const maxY = window.innerHeight - 72;
        return {
          x: Math.min(pos.x, maxX),
          y: Math.min(pos.y, maxY),
        };
      });
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // On mount, set initial position to bottom right
  useEffect(() => {
    setFabPosition(getInitialFabPosition());
  }, []);

  // Drag handlers
  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    setDragging(true);
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    dragOffset.current = {
      x: clientX - fabPosition.x,
      y: clientY - fabPosition.y,
    };
    e.stopPropagation();
  };

  const onDrag = (e: MouseEvent | TouchEvent) => {
    if (!dragging) return;
    let clientX: number, clientY: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }
    const minX = 8, minY = 8;
    const maxX = window.innerWidth - 64 - 8;
    const maxY = window.innerHeight - 64 - 8;
    const x = Math.max(minX, Math.min(clientX - dragOffset.current.x, maxX));
    const y = Math.max(minY, Math.min(clientY - dragOffset.current.y, maxY));
    setFabPosition({ x, y });
  };

  const stopDrag = () => setDragging(false);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent | TouchEvent) => onDrag(e);
    const up = () => stopDrag();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [dragging]);

  const handleSendMessage = async () => {
    if (!message.trim() || isProcessing) return;
    
    const messageToSend = message.trim();
    setMessage('');
    
    try {
      await onSendMessage(messageToSend);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleVoiceInput = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setIsListening(!isListening);
      // Voice input implementation would go here
    } else {
      console.warn('Speech recognition not supported');
    }
  };

  const getQuickActions = () => {
    if (!conversation?.messages.length) {
      return [
        'Create an invoice',
        'Find a customer',
        'Add an expense',
        'Show me analytics',
        'Help me get started'
      ];
    }
    
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    const meta = lastMessage.metadata;
    return Array.isArray(meta?.suggestedActions) ? meta.suggestedActions : [];
  };

  const quickActions = getQuickActions();

  if (!isOpen) {
    return (
      <div
        style={{
          position: 'fixed',
          left: fabPosition.x,
          top: fabPosition.y,
          zIndex: 50,
          width: 64,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: dragging ? 'none' : 'left 0.25s cubic-bezier(0.4,0,0.2,1), top 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s',
          touchAction: 'none',
        }}
      >
        <Button
          ref={fabRef}
          onClick={onToggle}
          onMouseDown={startDrag}
          onTouchStart={startDrag}
          className={cn(
            "w-16 h-16 aspect-square rounded-full shadow-2xl border-2 border-white bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center z-50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400",
            className
          )}
          style={{ minWidth: 64, minHeight: 64, maxWidth: 64, maxHeight: 64, padding: 0, userSelect: 'none', cursor: dragging ? 'grabbing' : 'grab' }}
          aria-label="Open AI Assistant"
          tabIndex={0}
        >
          <MessageCircle className="w-7 h-7" />
        </Button>
      </div>
    );
  }

  return (
    <Card className={cn(
      "fixed bottom-4 right-4 w-96 h-[600px] shadow-xl z-50",
      "flex flex-col bg-background border",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI Assistant</h3>
          {conversation?.status === 'active' && (
            <Badge variant="secondary" className="text-xs">Active</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {!conversation?.messages.length ? (
            <div className="text-center text-muted-foreground py-8">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">
                Hi! I'm your AI assistant. I can help you create invoices, 
                manage customers, track expenses, and generate reports.
              </p>
              <p className="text-xs mt-2">
                Try asking me something like "Create an invoice for John"
              </p>
            </div>
          ) : (
            conversation.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
          
          {isProcessing && <TypingIndicator />}
          
          {/* Action confirmations */}
          {conversation?.messages
            .filter(msg => msg.metadata?.actions?.some(action => action.status === 'pending'))
            .map(msg => (
              <ActionConfirmation
                key={`actions-${msg.id}`}
                message={msg}
                onConfirm={onConfirmAction}
                onReject={onRejectAction}
              />
            ))}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div className="px-4 py-2 border-t border-b bg-muted/50">
          <div className="flex flex-wrap gap-1">
            {quickActions.slice(0, 3).map((action, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setMessage(action)}
                disabled={isProcessing}
              >
                {action}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything about your business..."
              className="min-h-[40px] max-h-24 resize-none pr-12"
              disabled={isProcessing}
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-8 w-8 p-0"
              onClick={toggleVoiceInput}
              disabled={isProcessing}
            >
              {isListening ? (
                <MicOff className="h-4 w-4 text-red-500" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || isProcessing}
            size="sm"
            className="px-3"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}