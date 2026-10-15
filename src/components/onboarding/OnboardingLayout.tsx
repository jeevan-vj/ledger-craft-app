import React from 'react';
import { ThemeToggle } from '../ui/theme-toggle';

interface OnboardingLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export default function OnboardingLayout({ children, title, subtitle }: OnboardingLayoutProps) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-end mb-8">
          <ThemeToggle />
        </div>

        <div className="max-w-xl mx-auto">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
