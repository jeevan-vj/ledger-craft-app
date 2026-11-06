import React, { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

interface EnhancedBottomSheetProps {
  children: React.ReactNode;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  snapPoints?: number[]; // Height percentages [30, 60, 90]
  initialSnap?: number; // Index of initial snap point
  keyboardAware?: boolean;
  showHandle?: boolean;
  className?: string;
}

const EnhancedBottomSheet: React.FC<EnhancedBottomSheetProps> = ({
  children,
  trigger,
  open,
  onOpenChange,
  snapPoints = [30, 60, 90],
  initialSnap = 1,
  keyboardAware = true,
  showHandle = true,
  className
}) => {
  const [currentSnapIndex, setCurrentSnapIndex] = useState(initialSnap);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (!keyboardAware) return;

    const initialViewportHeight = window.visualViewport?.height || window.innerHeight;

    const handleViewportChange = () => {
      if (window.visualViewport) {
        const currentHeight = window.visualViewport.height;
        const heightDiff = initialViewportHeight - currentHeight;
        
        if (heightDiff > 150) { // Keyboard is likely open
          setKeyboardHeight(heightDiff);
          setIsKeyboardVisible(true);
        } else {
          setKeyboardHeight(0);
          setIsKeyboardVisible(false);
        }
      }
    };

    // Listen for viewport changes (iOS Safari)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
    }

    // Fallback for other browsers
    const handleResize = () => {
      const currentHeight = window.innerHeight;
      const heightDiff = initialViewportHeight - currentHeight;
      
      if (heightDiff > 150) {
        setKeyboardHeight(heightDiff);
        setIsKeyboardVisible(true);
      } else {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [keyboardAware]);

  const getCurrentHeight = () => {
    const baseHeight = snapPoints[currentSnapIndex];
    if (isKeyboardVisible && keyboardAware) {
      // Adjust height when keyboard is visible
      return Math.min(95, baseHeight + (keyboardHeight / window.innerHeight) * 100);
    }
    return baseHeight;
  };

  const handleSnapChange = (direction: 'up' | 'down') => {
    if (direction === 'up' && currentSnapIndex < snapPoints.length - 1) {
      setCurrentSnapIndex(currentSnapIndex + 1);
    } else if (direction === 'down' && currentSnapIndex > 0) {
      setCurrentSnapIndex(currentSnapIndex - 1);
    }
  };

  const drawerContent = (
    <DrawerContent
      className={cn(
        'transition-all duration-300 ease-out',
        isKeyboardVisible && keyboardAware && 'duration-200',
        className
      )}
      style={{
        height: `${getCurrentHeight()}vh`,
        paddingBottom: isKeyboardVisible ? `env(keyboard-inset-height, ${keyboardHeight}px)` : 'env(safe-area-inset-bottom, 1rem)'
      }}
    >
      {showHandle && (
        <div className="flex justify-center py-3">
          <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
        </div>
      )}
      
      <div className={cn(
        'flex-1 overflow-y-auto px-4',
        isKeyboardVisible && 'pb-4'
      )}>
        {children}
      </div>

      {/* Snap point indicators */}
      {snapPoints.length > 1 && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
          {snapPoints.map((_, index) => (
            <button
              key={index}
              className={cn(
                'w-2 h-2 rounded-full transition-colors',
                index === currentSnapIndex
                  ? 'bg-primary'
                  : 'bg-muted-foreground/30'
              )}
              onClick={() => setCurrentSnapIndex(index)}
            />
          ))}
        </div>
      )}
    </DrawerContent>
  );

  if (trigger) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerTrigger asChild>
          {trigger}
        </DrawerTrigger>
        {drawerContent}
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {drawerContent}
    </Drawer>
  );
};

export default EnhancedBottomSheet;