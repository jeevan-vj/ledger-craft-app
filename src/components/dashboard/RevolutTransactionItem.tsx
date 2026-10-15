import React from 'react';
import { LucideIcon, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/utils/invoiceUtils';
import { cn } from '@/lib/utils';

interface RevolutTransactionItemProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  amount: number;
  date?: string;
  status?: 'completed' | 'pending' | 'failed';
  onClick?: () => void;
  iconColor?: string;
  iconBgColor?: string;
}

export function RevolutTransactionItem({
  icon: Icon,
  title,
  subtitle,
  amount,
  date,
  status = 'completed',
  onClick,
  iconColor = 'text-revolut-blue-500',
  iconBgColor = 'bg-revolut-blue-100'
}: RevolutTransactionItemProps) {
  const isNegative = amount < 0;
  const isPositive = amount > 0;

  const statusStyles = {
    completed: '',
    pending: 'opacity-70',
    failed: 'opacity-50'
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-4 p-4 rounded-xl',
        'transition-all duration-200 hover:bg-muted/50 active:scale-[0.98]',
        'group',
        statusStyles[status]
      )}
    >
      {/* Icon */}
      <div className={cn(
        'flex-shrink-0 p-3 rounded-full',
        'transition-transform duration-200 group-hover:scale-110',
        iconBgColor
      )}>
        <Icon className={cn('h-5 w-5', iconColor)} strokeWidth={2} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-semibold text-sm truncate">{title}</h4>
          {status === 'pending' && (
            <span className="flex-shrink-0 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
              Pending
            </span>
          )}
          {status === 'failed' && (
            <span className="flex-shrink-0 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full">
              Failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{subtitle}</span>
          {date && (
            <>
              <span>•</span>
              <span className="flex-shrink-0">{date}</span>
            </>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="flex-shrink-0 flex items-center gap-2">
        <div className="text-right">
          <p className={cn(
            'font-bold text-sm',
            isPositive && 'text-emerald-600',
            isNegative && 'text-foreground'
          )}>
            {isPositive && '+'}{formatCurrency(Math.abs(amount))}
          </p>
        </div>
        {onClick && (
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </button>
  );
}

