import React from 'react';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/utils/invoiceUtils';

interface RevolutBalanceCardProps {
  totalBalance: number;
  availableBalance?: number;
  pendingBalance?: number;
  accountType?: 'personal' | 'business' | 'all';
  onAccountTypeChange?: (type: 'personal' | 'business' | 'all') => void;
  trend?: {
    value: number;
    isPositive: boolean;
    label?: string;
  };
  showShimmer?: boolean;
}

export function RevolutBalanceCard({
  totalBalance,
  availableBalance,
  pendingBalance,
  accountType = 'all',
  onAccountTypeChange,
  trend,
  showShimmer = true
}: RevolutBalanceCardProps) {
  const formattedBalance = formatCurrency(totalBalance);

  return (
    <Card className="relative overflow-hidden border-0 bg-revolut-gradient shadow-revolut-lg animate-fade-in">
      {/* Shimmer effect */}
      {showShimmer && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-shimmer animate-shimmer opacity-30" />
        </div>
      )}

      <div className="relative p-6 md:p-8">
        {/* Account Type Tabs */}
        {onAccountTypeChange && (
          <Tabs value={accountType} onValueChange={(value) => onAccountTypeChange(value as any)} className="mb-6">
            <TabsList className="bg-white/10 backdrop-blur-sm border-0">
              <TabsTrigger 
                value="personal" 
                className="data-[state=active]:bg-white/20 data-[state=active]:text-white text-white/70"
              >
                Personal
              </TabsTrigger>
              <TabsTrigger 
                value="business" 
                className="data-[state=active]:bg-white/20 data-[state=active]:text-white text-white/70"
              >
                Business
              </TabsTrigger>
              <TabsTrigger 
                value="all" 
                className="data-[state=active]:bg-white/20 data-[state=active]:text-white text-white/70"
              >
                All accounts
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Main Balance */}
        <div className="space-y-2">
          <p className="text-white/70 text-sm font-medium">Total Balance</p>
          <div className="flex items-baseline gap-3">
            <h2 className="text-5xl md:text-6xl font-bold text-white tracking-tight">
              {formattedBalance}
            </h2>
            {trend && (
              <div className={`flex items-center gap-1 px-3 py-1 rounded-full backdrop-blur-sm ${
                trend.isPositive 
                  ? 'bg-emerald-500/20 text-emerald-100' 
                  : 'bg-red-500/20 text-red-100'
              }`}>
                {trend.isPositive ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span className="text-sm font-semibold">
                  {trend.isPositive ? '+' : ''}{trend.value.toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {/* Balance Breakdown */}
          {(availableBalance !== undefined || pendingBalance !== undefined) && (
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-white/10">
              {availableBalance !== undefined && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <div>
                    <p className="text-white/50 text-xs">Available</p>
                    <p className="text-white text-sm font-semibold">
                      {formatCurrency(availableBalance)}
                    </p>
                  </div>
                </div>
              )}
              {pendingBalance !== undefined && pendingBalance > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-amber-400" />
                  <div>
                    <p className="text-white/50 text-xs">Pending</p>
                    <p className="text-white text-sm font-semibold">
                      {formatCurrency(pendingBalance)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Decorative Icon */}
        <div className="absolute top-6 right-6 opacity-10">
          <DollarSign className="h-32 w-32 text-white" strokeWidth={1} />
        </div>
      </div>
    </Card>
  );
}

