import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionRowProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  to?: string;
  onClick?: () => void;
  className?: string;
  testId?: string;
}

export function ActionRow({ icon: Icon, title, subtitle, to, onClick, className, testId }: ActionRowProps) {
  const content = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-foreground" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="font-semibold text-foreground">{title}</p>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-muted-foreground"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </>
  );

  const classes = cn(
    'flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-4 py-4',
    'transition-colors duration-200 hover:bg-muted/60',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    className
  );

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes} data-testid={testId}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes} data-testid={testId}>
      {content}
    </button>
  );
}
