import React, { useState } from 'react';
import { AlertTriangle, Clock, Mail, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Invoice } from '@/types';
import { paymentReminderService } from '@/services/paymentReminderService';
import { invoicesApi } from '@/features/invoices/api/invoicesApi';
import { businessProfileService } from '@/services/supabaseService';

interface PaymentReminderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
}

const PaymentReminderModal: React.FC<PaymentReminderModalProps> = ({
  open,
  onOpenChange,
  invoice,
}) => {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);
  
  const daysPastDue = paymentReminderService.calculateDaysPastDue(invoice.dueDate);
  const reminderType = paymentReminderService.getReminderType(daysPastDue);
  const customerEmail = invoice.customer?.email;

  const getReminderInfo = () => {
    switch (reminderType) {
      case 'gentle':
        return {
          title: 'Gentle Reminder',
          description: 'Send a friendly payment reminder',
          color: 'bg-blue-500',
          icon: <Clock className="h-4 w-4" />,
          badgeVariant: 'default' as const
        };
      case 'firm':
        return {
          title: 'Firm Notice',
          description: 'Send a more direct payment request',
          color: 'bg-orange-500',
          icon: <AlertTriangle className="h-4 w-4" />,
          badgeVariant: 'secondary' as const
        };
      case 'final':
        return {
          title: 'Final Notice',
          description: 'Send final payment demand',
          color: 'bg-red-500',
          icon: <AlertCircle className="h-4 w-4" />,
          badgeVariant: 'destructive' as const
        };
    }
  };

  const reminderInfo = getReminderInfo();

  const handleSendReminder = async () => {
    if (!customerEmail) {
      toast({
        title: 'Email Required',
        description: 'Customer email address is required to send payment reminders.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const businessProfile = await businessProfileService.getBusinessProfile();
      const reminderEmail = await paymentReminderService.createPaymentReminderEmail({
        to: customerEmail,
        invoice,
        businessProfile,
        reminderType,
        daysPastDue,
      });
      await invoicesApi.remind(invoice.id, {
        to: [customerEmail],
        subject: reminderEmail.subject,
        html: reminderEmail.html,
        reminderType,
        daysPastDue,
      });
      toast({
        title: 'Payment reminder sent!',
        description: `${reminderInfo.title} has been sent to ${customerEmail}`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error sending payment reminder:', error);
      toast({
        title: 'Failed to send reminder',
        description: error instanceof Error ? error.message : 'An error occurred while sending the payment reminder',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const isOverdue = daysPastDue > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Payment Reminder
          </DialogTitle>
          <DialogDescription>
            Send a payment reminder for Invoice {invoice.invoiceNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice Status */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium">Invoice {invoice.invoiceNumber}</p>
              <p className="text-sm text-muted-foreground">
                Due: {new Date(invoice.dueDate).toLocaleDateString()}
              </p>
              <p className="text-sm font-medium">
                Amount: {invoice.currency}{invoice.total.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              {isOverdue ? (
                <Badge variant="destructive" className="mb-2">
                  {daysPastDue} days overdue
                </Badge>
              ) : (
                <Badge variant="default" className="mb-2">
                  Due soon
                </Badge>
              )}
            </div>
          </div>

          {/* Customer Email */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Send to:</p>
            {customerEmail ? (
              <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">
                {invoice.customer?.name} - {customerEmail}
              </p>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No email address found for this customer. Please update the customer information first.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Reminder Type */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Reminder Type:</p>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <div className={`p-2 rounded-full ${reminderInfo.color} text-white`}>
                {reminderInfo.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{reminderInfo.title}</p>
                  <Badge variant={reminderInfo.badgeVariant}>
                    {daysPastDue === 0 ? 'Due today' : `${daysPastDue} days overdue`}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {reminderInfo.description}
                </p>
              </div>
            </div>
          </div>

          {/* Reminder Content Preview */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Email will include:</p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Professional payment reminder message</li>
              <li>• Complete invoice copy</li>
              <li>• Payment instructions and contact information</li>
              <li>• {reminderType === 'final' ? 'Final notice with consequences' : reminderType === 'firm' ? 'Firm tone with urgency' : 'Polite and professional tone'}</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendReminder}
              disabled={isSending || !customerEmail}
              className="flex-1"
            >
              {isSending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Reminder
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentReminderModal;