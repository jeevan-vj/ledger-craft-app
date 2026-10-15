import React, { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface ChartTab {
  id: string;
  label: string;
  content: ReactNode;
}

interface RevolutChartCardProps {
  title: string;
  description?: string;
  tabs?: ChartTab[];
  children?: ReactNode;
  className?: string;
  defaultTab?: string;
}

export function RevolutChartCard({
  title,
  description,
  tabs,
  children,
  className,
  defaultTab
}: RevolutChartCardProps) {
  if (tabs && tabs.length > 0) {
    return (
      <Card className={cn('animate-fade-in border-muted/50', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          {description && (
            <CardDescription className="text-sm">{description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={defaultTab || tabs[0].id} className="space-y-4">
            <TabsList className="grid w-full grid-cols-${tabs.length} bg-muted/50">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((tab) => (
              <TabsContent
                key={tab.id}
                value={tab.id}
                className="space-y-4 animate-fade-in"
              >
                {tab.content}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('animate-fade-in border-muted/50', className)}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        {description && (
          <CardDescription className="text-sm">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// Custom styled tooltip for charts
export function RevolutChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-white/95 backdrop-blur-sm px-4 py-3 rounded-xl shadow-revolut border border-muted">
      <p className="font-semibold text-sm mb-2">{label}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2 text-xs">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// Export chart configuration helpers
export const revolutChartConfig = {
  colors: {
    primary: '#5B72EE',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
    muted: '#94A3B8'
  },
  gradients: {
    primary: 'url(#primaryGradient)',
    success: 'url(#successGradient)',
    danger: 'url(#dangerGradient)'
  }
};

// SVG Gradient definitions component
export function RevolutChartGradients() {
  return (
    <defs>
      <linearGradient id="primaryGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5B72EE" stopOpacity={0.8} />
        <stop offset="100%" stopColor="#5B72EE" stopOpacity={0.1} />
      </linearGradient>
      <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#10B981" stopOpacity={0.8} />
        <stop offset="100%" stopColor="#10B981" stopOpacity={0.1} />
      </linearGradient>
      <linearGradient id="dangerGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#EF4444" stopOpacity={0.8} />
        <stop offset="100%" stopColor="#EF4444" stopOpacity={0.1} />
      </linearGradient>
    </defs>
  );
}

