import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import ReactDOM from 'react-dom';
import { AIConversation } from './AIConversation';

const FAB_POSITION_KEY = 'aiAssistantFabPosition';

function getInitialPosition() {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(FAB_POSITION_KEY);
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        if (
          typeof pos.x === 'number' &&
          typeof pos.y === 'number'
        ) {
          return pos;
        }
      } catch {
        // Ignore an invalid saved position and use the default below.
      }
    }
  }
  return { x: 24, y: 24 };
}

export const AIAssistantButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState(getInitialPosition);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  // Persist position
  useEffect(() => {
    localStorage.setItem(FAB_POSITION_KEY, JSON.stringify(position));
  }, [position]);

  // Keep within bounds on resize
  useEffect(() => {
    function handleResize() {
      setPosition((pos) => {
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
    offsetRef.current = {
      x: clientX - position.x,
      y: clientY - position.y,
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
    const x = Math.max(minX, Math.min(clientX - offsetRef.current.x, maxX));
    const y = Math.max(minY, Math.min(clientY - offsetRef.current.y, maxY));
    setPosition({ x, y });
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

  // Keyboard accessibility for FAB
  const handleFabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      setIsOpen(true);
      e.preventDefault();
    }
  };

  // Focus chat window when opened
  useEffect(() => {
    if (isOpen && chatRef.current) {
      chatRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard accessibility for chat window (Escape to close)
  const handleChatKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      if (buttonRef.current) buttonRef.current.focus();
    }
  };

  // FAB and chat window portal content
  const portalContent = (
    <>
      {/* Floating Button */}
      <div
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: 50,
          transition: dragging ? 'none' : 'box-shadow 0.2s',
          touchAction: 'none',
          width: 64,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: isOpen ? 'none' : 'auto',
        }}
      >
        {!isOpen ? (
          <button
            ref={buttonRef}
            onClick={() => setIsOpen(true)}
            onMouseDown={startDrag}
            onTouchStart={startDrag}
            aria-label="Open AI Assistant"
            tabIndex={0}
            className="w-16 h-16 aspect-square bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-2xl border-2 border-white transition-all duration-200 flex items-center justify-center group focus:outline-none focus:ring-2 focus:ring-blue-400"
            style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', minWidth: 64, minHeight: 64, maxWidth: 64, maxHeight: 64, padding: 0 }}
            onKeyDown={handleFabKeyDown}
          >
            <svg className="w-7 h-7 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Chat Window */}
      {isOpen && (
        <div
          ref={chatRef}
          className="fixed bottom-24 right-6 w-96 h-[600px] z-50 shadow-2xl bg-white rounded-xl outline-none"
          tabIndex={-1}
          aria-modal="true"
          role="dialog"
          onKeyDown={handleChatKeyDown}
        >
          <AIConversation onClose={() => setIsOpen(false)} />
        </div>
      )}

      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );

  // Use portal to render FAB and chat window at the document.body level
  return ReactDOM.createPortal(portalContent, document.body);
};