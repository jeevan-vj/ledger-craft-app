import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  backTo?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  backTo,
  onBack,
  actions,
  className,
}: PageHeaderProps) {
  const navigate = useNavigate();
  const showBack = Boolean(backTo || onBack);

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (backTo) {
      navigate(backTo);
    }
  };

  return (
    <div className={cn('mb-8', className)}>
      {showBack && (
        <button
          type="button"
          onClick={handleBack}
          className="mb-3 -ml-2 p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
        </button>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-4xl font-bold tracking-tight text-pretty text-foreground">{title}</h1>
          {description && (
            <p className="mt-2 text-base text-muted-foreground max-w-[65ch]">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
