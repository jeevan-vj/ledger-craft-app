import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, DollarSign, User, FileText, BarChart3 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { ConversationMessage, ConversationAction } from '../../types';
import { cn } from '../../lib/utils';

interface ActionConfirmationProps {
  message: ConversationMessage;
  onConfirm: (actionId: string) => Promise<void>;
  onReject: (actionId: string) => Promise<void>;
  className?: string;
}

export function ActionConfirmation({ 
  message, 
  onConfirm, 
  onReject,
  className 
}: ActionConfirmationProps) {
  const pendingActions = message.metadata?.actions?.filter(
    action => action.status === 'pending'
  ) || [];

  if (!pendingActions.length) return null;

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'create_invoice':
        return <FileText className="h-4 w-4" />;
      case 'create_customer':
        return <User className="h-4 w-4" />;
      case 'create_expense':
        return <DollarSign className="h-4 w-4" />;
      case 'generate_report':
        return <BarChart3 className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getActionTitle = (action: ConversationAction) => {
    switch (action.type) {
      case 'create_invoice':
        return `Create Invoice for ${action.parameters.customer || 'Customer'}`;
      case 'create_customer':
        return `Add New Customer: ${action.parameters.name || 'Unknown'}`;
      case 'create_expense':
        return `Record Expense: ${action.parameters.amount || 'Amount'}`;
      case 'generate_report':
        return `Generate ${action.parameters.type || 'Financial'} Report`;
      default:
        return `Execute ${action.type.replace('_', ' ')}`;
    }
  };

  const getActionDetails = (action: ConversationAction) => {
    const details: string[] = [];
    
    switch (action.type) {
      case 'create_invoice':
        if (action.parameters.customer) details.push(`Customer: ${action.parameters.customer}`);
        if (action.parameters.items?.length) {
          details.push(`Items: ${action.parameters.items.map((item) => typeof item === 'object' && item !== null && 'value' in item ? item.value : item).join(', ')}`);
        }
        if (action.parameters.amount) details.push(`Amount: ${action.parameters.amount}`);
        break;
        
      case 'create_customer':
        if (action.parameters.name) details.push(`Name: ${action.parameters.name}`);
        if (action.parameters.email) details.push(`Email: ${action.parameters.email}`);
        if (action.parameters.phone) details.push(`Phone: ${action.parameters.phone}`);
        break;
        
      case 'create_expense':
        if (action.parameters.amount) details.push(`Amount: ${action.parameters.amount}`);
        if (action.parameters.description) details.push(`Description: ${action.parameters.description}`);
        if (action.parameters.category) details.push(`Category: ${action.parameters.category}`);
        break;
        
      case 'generate_report':
        if (action.parameters.period) details.push(`Period: ${action.parameters.period}`);
        if (action.parameters.type) details.push(`Type: ${action.parameters.type}`);
        break;
    }
    
    return details;
  };

  const getRiskLevel = (action: ConversationAction) => {
    const riskLevels: Record<string, 'low' | 'medium' | 'high'> = {
      create_invoice: 'medium',
      send_invoice: 'high',
      create_customer: 'low',
      create_expense: 'medium',
      delete_invoice: 'high',
      delete_customer: 'high',
      generate_report: 'low'
    };
    
    return riskLevels[action.type] || 'medium';
  };

  return (
    <div className={cn("space-y-3", className)}>
      {pendingActions.map((action) => {
        const details = getActionDetails(action);
        const riskLevel = getRiskLevel(action);
        
        return (
          <Card key={action.type} className="p-4 border-l-4 border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getActionIcon(action.type)}
                  <h4 className="font-medium text-sm">
                    {getActionTitle(action)}
                  </h4>
                  <Badge 
                    variant={riskLevel === 'high' ? 'destructive' : riskLevel === 'medium' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {riskLevel} risk
                  </Badge>
                </div>
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
              </div>

              {/* Details */}
              {details.length > 0 && (
                <div className="bg-background/50 rounded p-2 text-xs space-y-1">
                  {details.map((detail, index) => (
                    <div key={index} className="text-muted-foreground">
                      {detail}
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Do you want me to proceed with this action?
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReject(action.type)}
                    className="text-xs h-7"
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onConfirm(action.type)}
                    className="text-xs h-7"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Confirm
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}