import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabaseDataService } from '@/services/supabaseDataService';

interface QuarterlyTrendsProps {
  userId: string;
  currentQuarter: {
    quarter: string;
    year: number;
  };
  trend: {
    current: number;
    previous: number;
    change: number;
  };
  className?: string;
}

interface QuarterData {
  quarter: string;
  year: number;
  gstPosition: number;
  totalSales: number;
  totalPurchases: number;
  gstOnSales: number;
  gstOnPurchases: number;
}

export const QuarterlyTrends: React.FC<QuarterlyTrendsProps> = ({
  userId,
  currentQuarter,
  trend,
  className
}) => {
  const [quarterlyData, setQuarterlyData] = useState<QuarterData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      loadQuarterlyData();
    }
  }, [userId, currentQuarter]);

  const loadQuarterlyData = async () => {
    try {
      setLoading(true);
      const data: QuarterData[] = [];

      // Load last 4 quarters of data
      for (let i = 3; i >= 0; i--) {
        const { quarter, year } = getQuarterFromOffset(currentQuarter, i);
        const { start, end } = getQuarterDates(quarter, year);
        
        const summary = await supabaseDataService.getGSTReturnSummary(userId, start, end);
        
        data.push({
          quarter: `Q${quarter}`,
          year,
          gstPosition: summary.netGstPosition,
          totalSales: summary.totalSales,
          totalPurchases: summary.totalPurchases,
          gstOnSales: summary.gstOnSales,
          gstOnPurchases: summary.gstOnPurchases
        });
      }

      setQuarterlyData(data);
    } catch (error) {
      console.error('Error loading quarterly data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = () => {
    if (trend.change > 0) return <TrendingUp className="h-4 w-4 text-red-600" />;
    if (trend.change < 0) return <TrendingDown className="h-4 w-4 text-green-600" />;
    return <Minus className="h-4 w-4 text-gray-600" />;
  };

  const getTrendColor = () => {
    if (trend.change > 0) return 'text-red-600';
    if (trend.change < 0) return 'text-green-600';
    return 'text-gray-600';
  };

  const getTrendText = () => {
    const percentage = trend.previous !== 0 ? 
      Math.abs((trend.change / trend.previous) * 100) : 0;
    
    if (trend.change > 0) {
      return `+${percentage.toFixed(1)}% from last quarter`;
    } else if (trend.change < 0) {
      return `-${percentage.toFixed(1)}% from last quarter`;
    }
    return 'No change from last quarter';
  };

  const maxValue = Math.max(...quarterlyData.map(q => Math.abs(q.gstPosition)));

  return (
    <Card className={cn('quarterly-trends-card', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">Quarterly GST Trends</CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Current Quarter Summary */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">
                ${Math.abs(trend.current).toFixed(0)}
              </div>
              <div className="text-sm text-muted-foreground">
                {currentQuarter.quarter} {currentQuarter.year}
              </div>
            </div>
            
            <div className="text-right">
              <div className={cn("flex items-center gap-1 text-sm font-medium", getTrendColor())}>
                {getTrendIcon()}
                ${Math.abs(trend.change).toFixed(0)}
              </div>
              <div className="text-xs text-muted-foreground">
                vs last quarter
              </div>
            </div>
          </div>

          {/* Trend Description */}
          <div className="text-sm">
            <Badge variant={trend.change > 0 ? 'destructive' : trend.change < 0 ? 'success' : 'secondary'}>
              {getTrendText()}
            </Badge>
          </div>

          {/* Simple Bar Chart */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase">
              GST Position by Quarter
            </div>
            
            {quarterlyData.map((quarter, index) => {
              const isRefund = quarter.gstPosition < 0;
              const barWidth = maxValue > 0 ? (Math.abs(quarter.gstPosition) / maxValue) * 100 : 0;
              const isCurrent = index === quarterlyData.length - 1;
              
              return (
                <div key={`${quarter.quarter}-${quarter.year}`} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className={cn("font-medium", isCurrent && "text-primary")}>
                      {quarter.quarter} '{quarter.year.toString().slice(-2)}
                    </span>
                    <span className={cn(
                      "font-medium",
                      isRefund ? "text-green-600" : "text-red-600"
                    )}>
                      {isRefund ? '-' : '+'}${Math.abs(quarter.gstPosition).toFixed(0)}
                    </span>
                  </div>
                  
                  <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        isRefund ? "bg-green-500" : "bg-red-500",
                        isCurrent && "opacity-100",
                        !isCurrent && "opacity-70"
                      )}
                      style={{ width: `${Math.max(barWidth, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Key Insights */}
          <div className="space-y-2 pt-2 border-t">
            <div className="text-xs font-medium text-muted-foreground uppercase">
              Key Insights
            </div>
            
            {/* Sales Trend */}
            {quarterlyData.length >= 2 && (
              <div className="text-xs">
                {(() => {
                  const current = quarterlyData[quarterlyData.length - 1];
                  const previous = quarterlyData[quarterlyData.length - 2];
                  const salesChange = current.totalSales - previous.totalSales;
                  const salesPercentage = previous.totalSales > 0 ? 
                    (salesChange / previous.totalSales) * 100 : 0;
                  
                  return (
                    <div className="flex items-center justify-between">
                      <span>Sales Growth:</span>
                      <span className={cn(
                        "font-medium",
                        salesChange > 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {salesChange > 0 ? '+' : ''}{salesPercentage.toFixed(1)}%
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Average GST Position */}
            <div className="text-xs">
              {(() => {
                const avgPosition = quarterlyData.length
                  ? quarterlyData.reduce((sum, q) => sum + q.gstPosition, 0) / quarterlyData.length
                  : 0;
                return (
                  <div className="flex items-center justify-between">
                    <span>Avg GST Position:</span>
                    <span className={cn(
                      "font-medium",
                      avgPosition > 0 ? "text-red-600" : "text-green-600"
                    )}>
                      ${Math.abs(avgPosition).toFixed(0)} {avgPosition > 0 ? 'owed' : 'refund'}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Compliance Note */}
            <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded">
              💡 Consistent positive GST positions indicate healthy business growth. 
              Consider monthly filing if amounts exceed $24k annually.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Helper functions
function getQuarterFromOffset(
  currentQuarter: { quarter: string; year: number }, 
  offset: number
): { quarter: number; year: number } {
  const currentQuarterNum = parseInt(currentQuarter.quarter.substring(1));
  let targetQuarter = currentQuarterNum - offset;
  let targetYear = currentQuarter.year;
  
  while (targetQuarter <= 0) {
    targetQuarter += 4;
    targetYear -= 1;
  }
  
  return { quarter: targetQuarter, year: targetYear };
}

function getQuarterDates(quarter: number, year: number) {
  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;
  
  const start = new Date(year, startMonth, 1).toISOString().split('T')[0];
  const end = new Date(year, endMonth + 1, 0).toISOString().split('T')[0];
  
  return { start, end };
}