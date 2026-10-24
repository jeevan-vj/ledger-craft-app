import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  Calculator, 
  Settings, 
  Download, 
  Upload, 
  PlusCircle,
  BarChart3,
  Calendar,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface QuickActionsProps {
  userId: string;
  className?: string;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
  variant?: 'default' | 'outline' | 'secondary';
  priority?: 'high' | 'medium' | 'low';
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  userId,
  className
}) => {
  const navigate = useNavigate();

  const actions: QuickAction[] = [
    {
      id: 'create-gst-return',
      title: 'Create GST Return',
      description: 'Generate quarterly GST return',
      icon: <FileText className="h-4 w-4" />,
      action: () => navigate('/ird-reports'),
      variant: 'default',
      priority: 'high'
    },
    {
      id: 'add-expense',
      title: 'Add Expense',
      description: 'Record business expense',
      icon: <PlusCircle className="h-4 w-4" />,
      action: () => navigate('/expenses'),
      variant: 'outline',
      priority: 'high'
    },
    {
      id: 'tax-calculator',
      title: 'Tax Calculator',
      description: 'Calculate tax on amounts',
      icon: <Calculator className="h-4 w-4" />,
      action: () => openTaxCalculator(),
      variant: 'outline',
      priority: 'medium'
    },
    {
      id: 'tax-settings',
      title: 'Tax Settings',
      description: 'Configure tax rates',
      icon: <Settings className="h-4 w-4" />,
      action: () => navigate('/tax-config'),
      variant: 'outline',
      priority: 'medium'
    },
    {
      id: 'export-data',
      title: 'Export Data',
      description: 'Download tax reports',
      icon: <Download className="h-4 w-4" />,
      action: () => handleExportData(),
      variant: 'outline',
      priority: 'low'
    },
    {
      id: 'import-receipts',
      title: 'Import Receipts',
      description: 'Bulk upload receipts',
      icon: <Upload className="h-4 w-4" />,
      action: () => handleImportReceipts(),
      variant: 'outline',
      priority: 'medium'
    },
    {
      id: 'tax-analytics',
      title: 'Tax Analytics',
      description: 'View tax insights',
      icon: <BarChart3 className="h-4 w-4" />,
      action: () => navigate('/tax-analytics'),
      variant: 'outline',
      priority: 'low'
    },
    {
      id: 'tax-calendar',
      title: 'Tax Calendar',
      description: 'View important dates',
      icon: <Calendar className="h-4 w-4" />,
      action: () => openTaxCalendar(),
      variant: 'outline',
      priority: 'medium'
    }
  ];

  const priorityActions = actions.filter(action => action.priority === 'high');
  const secondaryActions = actions.filter(action => action.priority !== 'high');

  const openTaxCalculator = () => {
    // Could open a modal or navigate to calculator page
    window.open('/tax-calculator', '_blank');
  };

  const handleExportData = () => {
    // Implement export functionality
    console.log('Export data functionality');
  };

  const handleImportReceipts = () => {
    // Implement import functionality
    console.log('Import receipts functionality');
  };

  const openTaxCalendar = () => {
    // Could open a modal or navigate to calendar page
    console.log('Open tax calendar');
  };

  return (
    <Card className={cn('quick-actions-card', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
        <Zap className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* High Priority Actions */}
          <div className="space-y-2">
            {priorityActions.map((action) => (
              <Button
                key={action.id}
                variant={action.variant}
                size="sm"
                className="w-full justify-start h-auto p-3"
                onClick={action.action}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="flex-shrink-0">
                    {action.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-sm">
                      {action.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {action.description}
                    </div>
                  </div>
                </div>
              </Button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t"></div>

          {/* Secondary Actions - Grid Layout */}
          <div className="grid grid-cols-2 gap-2">
            {secondaryActions.slice(0, 4).map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                className="h-auto p-2 flex-col gap-1"
                onClick={action.action}
              >
                <div className="flex-shrink-0">
                  {action.icon}
                </div>
                <div className="text-xs font-medium text-center">
                  {action.title}
                </div>
              </Button>
            ))}
          </div>

          {/* Show More Actions Button */}
          {secondaryActions.length > 4 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => navigate('/tax-tools')}
            >
              View All Tax Tools ({secondaryActions.length - 4} more)
            </Button>
          )}

          {/* Quick Tips */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="text-xs space-y-1">
              <div className="font-medium text-blue-800">💡 Quick Tip</div>
              <div className="text-blue-700">
                Keep receipts and invoices organized throughout the quarter 
                to make GST returns faster and more accurate.
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="font-medium">Keyboard Shortcuts:</div>
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>Create Invoice</span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Ctrl + I</kbd>
              </div>
              <div className="flex justify-between">
                <span>Add Expense</span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Ctrl + E</kbd>
              </div>
              <div className="flex justify-between">
                <span>GST Return</span>
                <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Ctrl + G</kbd>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
