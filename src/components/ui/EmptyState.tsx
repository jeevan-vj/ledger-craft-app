import React from 'react';
import { Link } from 'react-router-dom';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ActionRow } from '@/components/ui/ActionRow';

interface EmptyAction {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  to?: string;
  onClick?: () => void;
  testId?: string;
}

interface EmptyBenefit {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}

interface EmptyStateProps {
  variant?: 'panel' | 'hero';
  title: string;
  description?: string;
  actions?: EmptyAction[];
  benefits?: EmptyBenefit[];
  illustration?: React.ReactNode;
  ctaLabel?: string;
  ctaTo?: string;
  onCta?: () => void;
  learnMoreHref?: string;
  learnMoreLabel?: string;
  className?: string;
}

export function EmptyState({
  variant = 'panel',
  title,
  description,
  actions,
  benefits,
  illustration,
  ctaLabel,
  ctaTo,
  onCta,
  learnMoreHref,
  learnMoreLabel = 'Learn more',
  className,
}: EmptyStateProps) {
  if (variant === 'hero') {
    return (
      <div className={cn('mx-auto flex max-w-lg flex-col items-center text-center py-8', className)}>
        {illustration && <div className="mb-8 text-muted-foreground">{illustration}</div>}
        <h2 className="text-2xl font-bold tracking-tight uppercase text-pretty">{title}</h2>
        {description && <p className="mt-3 text-muted-foreground">{description}</p>}
        {benefits && benefits.length > 0 && (
          <ul className="mt-8 w-full space-y-5 text-left">
            {benefits.map((benefit) => (
              <li key={benefit.title} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <benefit.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{benefit.title}</p>
                  {benefit.subtitle && (
                    <p className="text-sm text-muted-foreground mt-0.5">{benefit.subtitle}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {ctaLabel && (
          <div className="mt-8 w-full">
            {ctaTo ? (
              <Button asChild size="pill">
                <Link to={ctaTo} data-testid="empty-create-invoice">{ctaLabel}</Link>
              </Button>
            ) : (
              <Button size="pill" onClick={onCta} data-testid="empty-create-invoice">
                {ctaLabel}
              </Button>
            )}
          </div>
        )}
        {learnMoreHref && (
          <a
            href={learnMoreHref}
            className="mt-4 text-sm font-medium underline underline-offset-4 text-foreground hover:text-muted-foreground"
          >
            {learnMoreLabel}
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl bg-card px-6 py-10 shadow-surface sm:px-10 sm:py-12',
        className
      )}
    >
      <h2 className="text-2xl font-bold tracking-tight text-pretty">{title}</h2>
      {description && <p className="mt-2 text-muted-foreground max-w-[65ch]">{description}</p>}
      {actions && actions.length > 0 && (
        <div className="mt-8 space-y-3">
          {actions.map((action) => (
            <ActionRow
              key={action.title}
              icon={action.icon}
              title={action.title}
              subtitle={action.subtitle}
              to={action.to}
              onClick={action.onClick}
              testId={action.testId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
