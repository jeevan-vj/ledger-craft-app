import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarIcon, CreditCard, Banknote, Receipt, FileText, AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { halfPaymentAmount } from '@/features/payments/halfPaymentAmount';
import { Invoice } from '@/types';
import { CreatePaymentRequest } from '@/types/payment';
import { formatCurrency } from '@/utils/invoiceUtils';

const paymentCaptureSchema = (balanceDue: number) => z.object({
  paymentMethod: z.enum(['bank_transfer', 'cash', 'cheque', 'credit_card', 'online']),
  amount: z.number()
    .min(0.01, 'Amount must be greater than 0')
    .max(balanceDue, 'Amount cannot exceed the balance due'),
  paymentDate: z.date(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  generateReceipt: z.boolean().default(true),
  emailCustomer: z.boolean().default(false)
});

type PaymentCaptureForm = z.infer<ReturnType<typeof paymentCaptureSchema>>;

interface PaymentCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
  onPaymentRecord: (data: CreatePaymentRequest) => Promise<void>;
  isLoading?: boolean;
}

const paymentMethods = [
  { 
    value: 'bank_transfer', 
    label: 'Bank Transfer', 
    icon: Banknote,
    description: 'Direct bank transfer or wire',
    requiresReference: true
  },
  { 
    value: 'cash', 
    label: 'Cash Payment', 
    icon: CreditCard,
    description: 'Cash received in person',
    requiresReference: false
  },
  { 
    value: 'cheque', 
    label: 'Cheque', 
    icon: FileText,
    description: 'Check payment',
    requiresReference: true
  },
  { 
    value: 'credit_card', 
    label: 'Credit/Debit Card', 
    icon: CreditCard,
    description: 'Card payment processed',
    requiresReference: true
  },
  { 
    value: 'online', 
    label: 'Online Payment', 
    icon: TrendingUp,
    description: 'PayPal, Stripe, etc.',
    requiresReference: true
  }
];

export function PaymentCaptureModal({ 
  open, 
  onOpenChange, 
  invoice, 
  onPaymentRecord, 
  isLoading = false 
}: PaymentCaptureModalProps) {
  const balance = invoice.balanceDue ?? invoice.total;
  const schema = useMemo(() => paymentCaptureSchema(balance), [balance]);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [step, setStep] = useState<'capture' | 'confirm'>('capture');
  const [formData, setFormData] = useState<PaymentCaptureForm | null>(null);
  
  const form = useForm<PaymentCaptureForm>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      amount: balance,
      paymentDate: new Date(),
      generateReceipt: true,
      emailCustomer: false,
      paymentMethod: 'bank_transfer'
    }
  });

  const watchedAmount = form.watch('amount') || 0;
  const watchedMethod = form.watch('paymentMethod');
  const selectedMethod = paymentMethods.find(m => m.value === watchedMethod);
  
  const isPartialPayment = watchedAmount > 0 && watchedAmount < balance;
  const balanceAfterPayment = balance - watchedAmount;
  const halfAmount = halfPaymentAmount(balance);

  const handleNext = async (data: PaymentCaptureForm) => {
    setFormData(data);
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!formData) return;
    
    const paymentRequest: CreatePaymentRequest = {
      invoiceId: invoice.id,
      paymentMethod: formData.paymentMethod,
      amount: formData.amount,
      paymentDate: formData.paymentDate.toISOString().split('T')[0],
      referenceNumber: formData.referenceNumber,
      notes: formData.notes,
      generateReceipt: formData.generateReceipt
    };
    
    await onPaymentRecord(paymentRequest);
    onOpenChange(false);
    setStep('capture');
    setFormData(null);
    form.reset();
  };

  const handleBack = () => {
    setStep('capture');
    setFormData(null);
  };

  const handleCancel = () => {
    onOpenChange(false);
    setStep('capture');
    setFormData(null);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-600" />
            {step === 'capture' ? 'Record Payment' : 'Confirm Payment Details'}
          </DialogTitle>
          <DialogDescription>
            {step === 'capture' 
              ? 'Capture payment details to mark this invoice as paid'
              : 'Review payment information before recording'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'capture' ? (
          <form onSubmit={form.handleSubmit(handleNext)} className="space-y-6">
            {/* Invoice Summary */}
            <Card className="border-l-4 border-l-blue-500 bg-blue-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-lg">
                  <span>Invoice #{invoice.invoiceNumber}</span>
                  <Badge variant="outline" className="bg-white">
                    {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Customer</Label>
                  <p className="font-medium">{invoice.customer?.name || invoice.customerId}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Due Date</Label>
                  <p className="font-medium">{invoice.dueDate}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Invoice Amount</Label>
                  <p className="font-bold text-lg tabular-nums">{formatCurrency(invoice.total)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Balance Due</Label>
                  <p className="font-bold text-lg tabular-nums text-destructive">{formatCurrency(balance)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="flex items-center gap-2">
                    {new Date(invoice.dueDate) < new Date() && invoice.status !== 'paid' ? (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Overdue
                      </Badge>
                    ) : (
                      <Badge variant="secondary">On Time</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Amount */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Amount</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount Received *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="pl-12"
                      {...form.register('amount', { valueAsNumber: true })}
                    />
                  </div>
                  {form.formState.errors.amount && (
                    <p className="text-sm text-red-600">{form.formState.errors.amount.message}</p>
                  )}
                  
                  {/* Payment Amount Indicators */}
                  {isPartialPayment && (
                    <Alert className="border-amber-200 bg-amber-50">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-800">
                        <strong>Partial Payment:</strong> Remaining balance of {formatCurrency(balanceAfterPayment)} will keep invoice as "partially paid"
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {!isPartialPayment && watchedAmount === balance && (
                    <Alert className="border-success/30 bg-success/10">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <AlertDescription className="text-foreground">
                        <strong>Full Payment:</strong> Invoice will be marked as "Paid"
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Quick Amount Buttons */}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Full remaining balance ${formatCurrency(balance)}`}
                      onClick={() => form.setValue('amount', balance, { shouldDirty: true, shouldValidate: true })}
                      className="text-xs"
                    >
                      Full remaining balance ({formatCurrency(balance)})
                    </Button>
                    {Number(halfAmount) > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => form.setValue('amount', Number(halfAmount), { shouldDirty: true, shouldValidate: true })}
                        className="text-xs"
                      >
                        Half Payment ({halfAmount})
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Method */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Method</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label>How was this payment received? *</Label>
                  <Select onValueChange={(value) => form.setValue('paymentMethod', value as PaymentCaptureForm['paymentMethod'])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => {
                        const IconComponent = method.icon;
                        return (
                          <SelectItem key={method.value} value={method.value}>
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-3">
                                <IconComponent className="h-4 w-4" />
                                <div>
                                  <div className="font-medium">{method.label}</div>
                                  <div className="text-xs text-muted-foreground">{method.description}</div>
                                </div>
                              </div>
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
                        {paymentDate ? format(paymentDate, 'dd MMM yyyy') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={paymentDate}
                        onSelect={(newDate) => {
                          if (newDate) {
                            setPaymentDate(newDate);
                            form.setValue('paymentDate', newDate);
                          }
                        }}
                        disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    When was the payment actually received?
                  </p>
                </div>

                {/* Reference Number */}
                {selectedMethod?.requiresReference && (
                  <div className="space-y-2">
                    <Label htmlFor="reference">
                      Reference Number *
                      <span className="text-muted-foreground font-normal ml-1">
                        ({selectedMethod.value === 'bank_transfer' ? 'Transfer reference' : 
                          selectedMethod.value === 'cheque' ? 'Cheque number' : 
                          selectedMethod.value === 'credit_card' ? 'Last 4 digits' : 
                          'Transaction ID'})
                      </span>
                    </Label>
                    <Input
                      id="reference"
                      placeholder={
                        selectedMethod.value === 'bank_transfer' ? 'e.g., TXN123456789' :
                        selectedMethod.value === 'cheque' ? 'e.g., CHQ001234' :
                        selectedMethod.value === 'credit_card' ? 'e.g., ****1234' :
                        'e.g., PAY_987654321'
                      }
                      {...form.register('referenceNumber')}
                    />
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Payment Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional details about this payment..."
                    rows={2}
                    {...form.register('notes')}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Receipt and Notification Options */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Receipt & Notifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Generate Receipt</Label>
                    <p className="text-sm text-muted-foreground">
                      Create a professional payment receipt
                    </p>
                  </div>
                  <Switch
                    checked={form.watch('generateReceipt')}
                    onCheckedChange={(checked) => form.setValue('generateReceipt', checked)}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Email Customer</Label>
                    <p className="text-sm text-muted-foreground">
                      Send payment confirmation and receipt via email
                    </p>
                  </div>
                  <Switch
                    checked={form.watch('emailCustomer')}
                    onCheckedChange={(checked) => form.setValue('emailCustomer', checked)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !form.formState.isValid}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              >
                Review Payment →
              </Button>
            </div>
          </form>
        ) : (
          // Confirmation Step
          <div className="space-y-6">
            {/* Payment Summary */}
            <Card className="border-l-4 border-l-green-500 bg-green-50/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  Payment Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Invoice</Label>
                    <p className="font-medium">#{invoice.invoiceNumber}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Customer</Label>
                    <p className="font-medium">{invoice.customer?.name || invoice.customerId}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Payment Amount</Label>
                    <p className="font-bold text-lg text-green-600">{formatCurrency(formData?.amount || 0)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Payment Method</Label>
                    <p className="font-medium">
                      {paymentMethods.find(m => m.value === formData?.paymentMethod)?.label}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Payment Date</Label>
                    <p className="font-medium">
                      {formData?.paymentDate ? format(formData.paymentDate, 'dd MMM yyyy') : ''}
                    </p>
                  </div>
                  {formData?.referenceNumber && (
                    <div>
                      <Label className="text-muted-foreground">Reference</Label>
                      <p className="font-medium">{formData.referenceNumber}</p>
                    </div>
                  )}
                </div>

                {formData?.notes && (
                  <div>
                    <Label className="text-muted-foreground">Notes</Label>
                    <p className="text-sm mt-1 p-2 bg-white rounded border">{formData.notes}</p>
                  </div>
                )}

                <Separator />

                <div className="flex items-center justify-between text-sm">
                  <span>Receipt Generation:</span>
                  <Badge variant={formData?.generateReceipt ? "default" : "secondary"}>
                    {formData?.generateReceipt ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Email Customer:</span>
                  <Badge variant={formData?.emailCustomer ? "default" : "secondary"}>
                    {formData?.emailCustomer ? "Yes" : "No"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Result Preview */}
            <Alert className="border-blue-200 bg-blue-50">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <strong>After recording this payment:</strong>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>• Invoice status will be updated to "{
                    (formData?.amount || 0) >= balance ? 'Paid' : 'Partially Paid'
                  }"</li>
                  <li>• Payment will be recorded in your financial records</li>
                  {formData?.generateReceipt && <li>• Receipt will be generated and stored</li>}
                  {formData?.emailCustomer && <li>• Customer will receive payment confirmation email</li>}
                </ul>
              </AlertDescription>
            </Alert>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={isLoading}
                className="flex-1"
              >
                ← Back to Edit
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isLoading}
                className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
              >
                {isLoading ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Recording Payment...
                  </>
                ) : (
                  <>
                    <Receipt className="mr-2 h-4 w-4" />
                    Record Payment
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
