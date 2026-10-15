import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RevolutQuickActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'success' | 'warning';
  className?: string;
}

export function RevolutQuickActionButton({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  className
}: RevolutQuickActionButtonProps) {
  const variantStyles = {
    default: 'bg-white/10 hover:bg-white/20 text-white border-white/20',
    primary: 'bg-revolut-blue-600 hover:bg-revolut-blue-700 text-white border-revolut-blue-500/30',
    success: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 border-emerald-500/30',
    warning: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border-amber-500/30'
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center gap-2 p-4 rounded-2xl backdrop-blur-sm border',
        'transition-all duration-200 ease-out hover:scale-105 active:scale-95',
        'shadow-glass hover:shadow-revolut',
        'min-w-[80px] md:min-w-[100px]',
        variantStyles[variant],
        className
      )}
    >
      <div className={cn(
        'p-3 rounded-full transition-transform duration-200',
        'group-hover:scale-110',
        variant === 'default' && 'bg-white/10',
        variant === 'primary' && 'bg-white/20',
        variant === 'success' && 'bg-emerald-400/20',
        variant === 'warning' && 'bg-amber-400/20'
      )}>
        <Icon className="h-6 w-6" strokeWidth={2} />
      </div>
      <span className="text-xs md:text-sm font-medium text-center leading-tight">
        {label}
      </span>
    </button>
  );
}

