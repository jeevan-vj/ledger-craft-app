import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarIcon, CreditCard, Banknote, Receipt, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { CreatePaymentRequest, EnhancedInvoice } from '@/types/payment';

const paymentSchema = z.object({
  paymentMethod: z.enum(['bank_transfer', 'cash', 'cheque', 'credit_card', 'online']),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  paymentDate: z.date(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  generateReceipt: z.boolean().default(true)
});

interface PaymentFormProps {
  invoice: EnhancedInvoice;
  onSubmit: (data: CreatePaymentRequest) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

const paymentMethods = [
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Banknote },
  { value: 'cash', label: 'Cash', icon: CreditCard },
  { value: 'cheque', label: 'Cheque', icon: FileText },
  { value: 'credit_card', label: 'Credit Card', icon: CreditCard },
  { value: 'online', label: 'Online Payment', icon: CreditCard }
];

export function PaymentForm({ invoice, onSubmit, onCancel, isLoading = false }: PaymentFormProps) {
  const [date, setDate] = useState<Date>(new Date());
  
  const form = useForm<z.infer<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: Math.max(0.01, invoice.balanceDue || 0.01),
      paymentDate: new Date(),
      generateReceipt: true,
      paymentMethod: 'bank_transfer' // Set default payment method
    }
  });

  const handleSubmit = async (data: z.infer<typeof paymentSchema>) => {
    const paymentRequest: CreatePaymentRequest = {
      invoiceId: invoice.id,
      paymentMethod: data.paymentMethod,
      amount: data.amount,
      paymentDate: data.paymentDate.toISOString().split('T')[0],
      referenceNumber: data.referenceNumber,
      notes: data.notes,
      generateReceipt: data.generateReceipt
    };
    
    await onSubmit(paymentRequest);
  };

  const watchedAmount = form.watch('amount') || 0;
  const balanceDue = invoice.balanceDue || 0;
  const isPartialPayment = watchedAmount < balanceDue;
  const isOverpayment = watchedAmount > balanceDue;

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {/* Invoice Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5" />
            Payment for Invoice #{invoice.invoiceNumber}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <Label className="text-muted-foreground">Customer</Label>
            <p className="font-medium">{invoice.customer?.name || 'Unknown Customer'}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Invoice Date</Label>
            <p className="font-medium">
              {invoice.date ? format(new Date(invoice.date), 'dd MMM yyyy') : 'N/A'}
            </p>
          </div>
          <div>
            <Label className="text-muted-foreground">Total Amount</Label>
            <p className="font-medium">{invoice.currency || '$'}{(invoice.total || 0).toFixed(2)}</p>
          </div>
          <div>
            <Label className="text-muted-foreground">Balance Due</Label>
            <p className="font-bold text-lg text-red-600">
              {invoice.currency || '$'}{(invoice.balanceDue || 0).toFixed(2)}
            </p>
          </div>
          {(invoice.totalPaid || 0) > 0 && (
            <>
              <div>
                <Label className="text-muted-foreground">Already Paid</Label>
                <p className="font-medium text-green-600">
                  {invoice.currency || '$'}{(invoice.totalPaid || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <Badge variant={invoice.paymentStatus === 'paid' ? 'default' : 'secondary'}>
                  {invoice.paymentStatus.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Payment Amount */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">Payment Amount *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {invoice.currency || '$'}
              </span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={(invoice.balanceDue || 0) * 1.1} // Allow 10% overpayment
                className="pl-12"
                {...form.register('amount', { valueAsNumber: true })}
              />
            </div>
            {form.formState.errors.amount && (
              <p className="text-sm text-red-600">{form.formState.errors.amount.message}</p>
            )}
            
            {/* Payment Amount Indicators */}
            {isPartialPayment && (
              <Alert className="border-yellow-200 bg-yellow-50">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  This is a partial payment. Remaining balance: {invoice.currency || '$'}
                  {((invoice.balanceDue || 0) - watchedAmount).toFixed(2)}
                </AlertDescription>
              </Alert>
            )}
            
            {isOverpayment && (
              <Alert className="border-orange-200 bg-orange-50">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800">
                  Payment exceeds balance due by: {invoice.currency || '$'}
                  {(watchedAmount - (invoice.balanceDue || 0)).toFixed(2)}
                </AlertDescription>
              </Alert>
            )}

            {/* Quick Amount Buttons */}
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => form.setValue('amount', invoice.balanceDue || 0)}
                className="text-xs"
              >
                Full Amount ({invoice.currency || '$'}{(invoice.balanceDue || 0).toFixed(2)})
              </Button>
              {(invoice.balanceDue || 0) > 100 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => form.setValue('amount', (invoice.balanceDue || 0) / 2)}
                  className="text-xs"
                >
                  Half ({invoice.currency || '$'}{((invoice.balanceDue || 0) / 2).toFixed(2)})
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Payment Method *</Label>
            <Select onValueChange={(value) => form.setValue('paymentMethod', value as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((method) => {
                  const IconComponent = method.icon;
                  return (
                    <SelectItem key={method.value} value={method.value}>
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4" />
                        {method.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {form.formState.errors.paymentMethod && (
              <p className="text-sm text-red-600">{form.formState.errors.paymentMethod.message}</p>
            )}
          </div>

          {/* Payment Date */}
          <div className="space-y-2">
            <Label>Payment Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'dd MMM yyyy') : 'Select date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(newDate) => {
                    if (newDate) {
                      setDate(newDate);
                      form.setValue('paymentDate', newDate);
                    }
                  }}
                  disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <Label htmlFor="reference">Reference Number</Label>
            <Input
              id="reference"
              placeholder="e.g., Transfer reference, cheque number"
              {...form.register('referenceNumber')}
            />
            <p className="text-xs text-muted-foreground">
              Optional: Bank reference, cheque number, or transaction ID
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional payment notes or comments"
              rows={3}
              {...form.register('notes')}
            />
          </div>

          <Separator />

          {/* Receipt Generation */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Generate Receipt</Label>
              <p className="text-sm text-muted-foreground">
                Automatically create a receipt for this payment
              </p>
            </div>
            <Switch
              checked={form.watch('generateReceipt')}
              onCheckedChange={(checked) => form.setValue('generateReceipt', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tax Information */}
      {invoice.taxBreakdown && (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Tax Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground">Subtotal</Label>
              <p>{invoice.currency || '$'}{(invoice.taxBreakdown.subtotal || 0).toFixed(2)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">{invoice.taxBreakdown.taxName || 'Tax'}</Label>
              <p>{invoice.currency || '$'}{(invoice.taxBreakdown.taxAmount || 0).toFixed(2)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Total</Label>
              <p className="font-medium">{invoice.currency || '$'}{(invoice.taxBreakdown.total || 0).toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
          className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
        >
          {isLoading ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Processing...
            </>
          ) : (
            <>
              <Receipt className="mr-2 h-4 w-4" />
              Record Payment
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
