import React, { useEffect, useState } from 'react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/invoiceUtils';

interface RevolutStatCardProps {
  icon: LucideIcon;
  title: string;
  value: number;
  subtitle?: string;
  trend?: {
    value: number;
    label?: string;
  };
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  isCurrency?: boolean;
  suffix?: string;
  animateValue?: boolean;
}

export function RevolutStatCard({
  icon: Icon,
  title,
  value,
  subtitle,
  trend,
  variant = 'default',
  isCurrency = false,
  suffix,
  animateValue = true
}: RevolutStatCardProps) {
  const [displayValue, setDisplayValue] = useState(animateValue ? 0 : value);

  useEffect(() => {
    if (!animateValue) return;
    
    const duration = 1000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current += increment;
      
      if (step >= steps) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(current);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value, animateValue]);

  const variantStyles = {
    default: {
      icon: 'text-revolut-blue-600 bg-revolut-blue-100',
      value: 'text-foreground',
      card: 'border-revolut-blue-200/50'
    },
    success: {
      icon: 'text-emerald-600 bg-emerald-100',
      value: 'text-emerald-600',
      card: 'border-emerald-200/50'
    },
    warning: {
      icon: 'text-amber-600 bg-amber-100',
      value: 'text-amber-600',
      card: 'border-amber-200/50'
    },
    danger: {
      icon: 'text-red-600 bg-red-100',
      value: 'text-red-600',
      card: 'border-red-200/50'
    },
    info: {
      icon: 'text-blue-600 bg-blue-100',
      value: 'text-blue-600',
      card: 'border-blue-200/50'
    }
  };

  const styles = variantStyles[variant];
  
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <TrendingUp className="h-4 w-4" />;
    if (trend.value < 0) return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const getTrendColor = () => {
    if (!trend) return '';
    if (trend.value > 0) return 'text-emerald-600 bg-emerald-50';
    if (trend.value < 0) return 'text-red-600 bg-red-50';
    return 'text-muted-foreground bg-muted';
  };

  const formatValue = (val: number) => {
    if (isCurrency) return formatCurrency(val);
    if (suffix) return `${Math.round(val)}${suffix}`;
    return Math.round(val).toLocaleString();
  };

  return (
    <Card className={cn(
      'relative overflow-hidden transition-all duration-300 hover:shadow-lg',
      'animate-scale-in border',
      styles.card
    )}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            'p-3 rounded-xl transition-transform duration-200 hover:scale-110',
            styles.icon
          )}>
            <Icon className="h-6 w-6" strokeWidth={2} />
          </div>
          
          {trend && (
            <div className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold',
              getTrendColor()
            )}>
              {getTrendIcon()}
              <span>{Math.abs(trend.value).toFixed(1)}%</span>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {title}
          </p>
          <p className={cn('text-3xl font-bold tracking-tight', styles.value)}>
            {formatValue(displayValue)}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">
              {subtitle}
            </p>
          )}
          {trend?.label && (
            <p className="text-xs text-muted-foreground mt-1">
              {trend.label}
            </p>
          )}
        </div>
      </div>

      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/[0.02] pointer-events-none" />
    </Card>
  );
}

