import React from 'react';
import { cn } from '@/lib/utils';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex w-full rounded-full bg-muted p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
