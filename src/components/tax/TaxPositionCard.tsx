import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaxPositionCardProps {
  amount: number;
  quarter: {
    quarter: string;
    year: number;
  };
  className?: string;
}

export const TaxPositionCard: React.FC<TaxPositionCardProps> = ({
  amount,
  quarter,
  className
}) => {
  const isRefund = amount < 0;
  const isZero = amount === 0;
  const absoluteAmount = Math.abs(amount);

  const getStatusVariant = (): React.ComponentProps<typeof Badge>['variant'] => {
    if (isZero) return 'secondary';
    if (isRefund) return 'success';
    if (absoluteAmount > 5000) return 'destructive';
    return 'warning';
  };

  const getStatusText = () => {
    if (isZero) return 'No GST Due';
    if (isRefund) return 'Refund Expected';
    if (absoluteAmount > 5000) return 'Large Payment Due';
    return 'Payment Required';
  };

  const getStatusIcon = () => {
    if (isZero) return <CheckCircle className="h-4 w-4" />;
    if (isRefund) return <TrendingDown className="h-4 w-4 text-green-600" />;
    return <TrendingUp className="h-4 w-4 text-red-600" />;
  };

  const getAmountColor = () => {
    if (isZero) return 'text-muted-foreground';
    if (isRefund) return 'text-green-600';
    return 'text-red-600';
  };

  const getTrendDirection = () => {
    if (isRefund) return 'down';
    if (amount > 0) return 'up';
    return 'neutral';
  };

  return (
    <Card className={cn('tax-position-card relative overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Current GST Position</CardTitle>
        <DollarSign className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      
      <CardContent>
        <div className="space-y-3">
          {/* Main Amount Display */}
          <div className="flex items-baseline space-x-2">
            <div className={cn("text-2xl font-bold", getAmountColor())}>
              {isRefund ? '-' : ''}${absoluteAmount.toFixed(2)}
            </div>
            {getStatusIcon()}
          </div>

          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <Badge variant={getStatusVariant()} className="text-xs">
              {getStatusText()}
            </Badge>
            <div className="text-xs text-muted-foreground">
              {quarter.quarter} {quarter.year}
            </div>
          </div>

          {/* Description */}
          <div className="text-sm text-muted-foreground">
            {isZero && (
              <p>No GST liability for this quarter</p>
            )}
            {isRefund && (
              <p>You're entitled to a GST refund from IRD</p>
            )}
            {amount > 0 && amount <= 1000 && (
              <p>Small GST payment due to IRD</p>
            )}
            {amount > 1000 && amount <= 5000 && (
              <p>Moderate GST payment due to IRD</p>
            )}
            {amount > 5000 && (
              <p>Significant GST payment due - plan accordingly</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            {amount !== 0 && (
              <Button size="sm" variant="outline" className="flex-1 text-xs">
                View Details
              </Button>
            )}
            
            <Button size="sm" className="flex-1 text-xs">
              {amount > 0 ? 'Prepare Payment' : amount < 0 ? 'Claim Refund' : 'Generate Return'}
            </Button>
          </div>

          {/* Warning for large amounts */}
          {absoluteAmount > 10000 && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-md border border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <div className="text-xs text-amber-700">
                Large amount - consider monthly GST filing
              </div>
            </div>
          )}

          {/* GST Threshold Warning */}
          {amount === 0 && (
            <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded-md">
              💡 Tip: Monitor your annual turnover for GST registration requirements ($60k threshold)
            </div>
          )}
        </div>
      </CardContent>

      {/* Visual indicator line */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0 h-1",
          isRefund ? "bg-green-500" : amount > 0 ? "bg-red-500" : "bg-gray-300"
        )}
      />
    </Card>
  );
};