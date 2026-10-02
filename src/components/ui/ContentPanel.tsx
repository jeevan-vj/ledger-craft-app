import React from 'react';
import { cn } from '@/lib/utils';

interface ContentPanelProps {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}

export function ContentPanel({ children, className, padded = true }: ContentPanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-card shadow-surface',
        padded && 'p-6 sm:p-8',
        className
      )}
    >
      {children}
    </div>
  );
}
