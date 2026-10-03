import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Drawer,
  DrawerContent,
} from '@/components/ui/drawer';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/utils/invoiceUtils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Expense, PaymentMethod } from '@/types';
import { DrawerFormLayout } from '@/components/ui/DrawerFormLayout';
import { useAppData } from '@/hooks/useAppData';
import { 
  Sparkles, 
  FileText, 
  DollarSign, 
  CreditCard, 
  Receipt, 
  ChevronDown, 
  ChevronUp,
  Tag,
  Building,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReceiptUpload from './ReceiptUpload';
import { ReceiptScanResult } from '@/types/receipt';

// NZ IRD GST Treatment Types
const gstTreatmentOptions = [
  { value: 'standard', label: '✅ Standard (15% fully claimable)' },
  { value: 'zero_rated', label: '0️⃣ Zero-Rated (0% but claimable)' },
  { value: 'exempt', label: '⛔ Exempt (No GST)' },
  { value: 'partial', label: '⚠️ Partial (Limited claim %)' },
  { value: 'private_use', label: '🏠 Private Use Adjustment' },
] as const;

// NZ IRD GST Exemption Reasons
const gstExemptionReasons = [
  { value: 'none', label: 'Fully Claimable (100%)', claimablePercent: 100 },
  { value: 'motor_vehicle', label: '🚗 Motor Vehicle', claimablePercent: 100 },
  { value: 'financial_services', label: '🏦 Financial Services (Exempt)', claimablePercent: 0 },
  { value: 'residential_rent', label: '🏘️ Residential Rent (Exempt)', claimablePercent: 0 },
  { value: 'insurance_life', label: '📋 Life Insurance (Exempt)', claimablePercent: 0 },
  { value: 'exported_services', label: '✈️ Zero-Rated (Exports)', claimablePercent: 100 },
  { value: 'entertainment_50', label: '🍽️ Entertainment (50%)', claimablePercent: 50 },
  { value: 'home_office', label: '🏠 Home Office', claimablePercent: 100 },
  { value: 'second_hand_goods', label: '🔄 Second-hand Goods', claimablePercent: 100 },
  { value: 'other_exempt', label: '❌ Other Exempt', claimablePercent: 0 },
] as const;

const expenseFormSchema = z.object({
  description: z.string().min(1, { message: 'Description is required' }),
  amount: z.number().min(0.01, { message: 'Amount must be greater than 0' }),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  vendorName: z.string().optional().or(z.literal('')),
  receiptUrl: z.string().optional().or(z.literal('')),
  expenseDate: z.string().min(1, { message: 'Expense date is required' }),
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  isBillable: z.boolean().default(false),
  customerId: z.string().optional(),
  taxAmount: z.number().min(0).default(0),
  currency: z.string().default('NZD'),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'check', 'other']).optional(),
  notes: z.string().optional().or(z.literal('')),
  // NZ IRD GST exemption fields
  gstTreatment: z.enum(['standard', 'zero_rated', 'exempt', 'partial', 'private_use']).default('standard'),
  gstExemptionReason: z.enum(['none', 'motor_vehicle', 'financial_services', 'residential_rent', 'insurance_life', 'exported_services', 'entertainment_50', 'home_office', 'second_hand_goods', 'other_exempt']).default('none'),
  gstClaimablePercentage: z.number().min(0).max(100).default(100),
  privateUsePercentage: z.number().min(0).max(100).default(0),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

interface ExpenseFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: Expense | null;
  onSubmit: (values: ExpenseFormValues) => void;
}

const ExpenseFormDrawer: React.FC<ExpenseFormDrawerProps> = ({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
}) => {
  const { expenseCategories, accounts, customers } = useAppData();
  const [, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(initialValues?.receiptUrl || null);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [showTaxDetails, setShowTaxDetails] = useState(false);
  const [showBillingDetails, setShowBillingDetails] = useState(false);
  const [showGstExemptionDetails, setShowGstExemptionDetails] = useState(false);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      description: '',
      amount: 0,
      categoryId: 'no-category',
      accountId: 'no-account',
      vendorName: '',
      receiptUrl: '',
      expenseDate: formatDate(new Date()),
      status: 'pending',
      isBillable: false,
      customerId: 'no-customer',
      taxAmount: 0,
      currency: 'NZD',
      // GST exemption defaults
      gstTreatment: 'standard',
      gstExemptionReason: 'none',
      gstClaimablePercentage: 100,
      privateUsePercentage: 0,
      paymentMethod: undefined,
      notes: ''
    }
  });

  useEffect(() => {
    if (initialValues) {
      const hasPaymentMethod = initialValues.paymentMethod !== undefined;
      const hasTaxAmount = initialValues.taxAmount !== undefined && initialValues.taxAmount > 0;
      const isBillable = initialValues.isBillable || false;
      
      form.reset({
        description: initialValues.description || '',
        amount: initialValues.amount || 0,
        categoryId: initialValues.categoryId || 'no-category',
        accountId: initialValues.accountId || 'no-account',
        vendorName: initialValues.vendorName || '',
        receiptUrl: initialValues.receiptUrl || '',
        expenseDate: initialValues.expenseDate || formatDate(new Date()),
        status: initialValues.status || 'pending',
        isBillable: isBillable,
        customerId: initialValues.customerId || 'no-customer',
        taxAmount: initialValues.taxAmount || 0,
        currency: initialValues.currency || 'NZD',
        gstTreatment: initialValues.gstTreatment || 'standard',
        gstExemptionReason: initialValues.gstExemptionReason || 'none',
        gstClaimablePercentage: initialValues.gstClaimablePercentage ?? 100,
        privateUsePercentage: initialValues.privateUsePercentage ?? 0,
        paymentMethod: initialValues.paymentMethod || undefined,
        notes: initialValues.notes || ''
      });
      setReceiptUrl(initialValues.receiptUrl || null);
      setReceiptFile(null);
      setShowPaymentDetails(hasPaymentMethod);
      setShowTaxDetails(hasTaxAmount);
      setShowBillingDetails(isBillable);
    } else {
      form.reset({
        description: '',
        amount: 0,
        categoryId: 'no-category',
        accountId: 'no-account',
        vendorName: '',
        receiptUrl: '',
        expenseDate: formatDate(new Date()),
        status: 'pending',
        isBillable: false,
        customerId: 'no-customer',
        taxAmount: 0,
        currency: 'NZD',
        gstTreatment: 'standard',
        gstExemptionReason: 'none',
        gstClaimablePercentage: 100,
        privateUsePercentage: 0,
        paymentMethod: undefined,
        notes: ''
      });
      setReceiptUrl(null);
      setReceiptFile(null);
      setShowPaymentDetails(false);
      setShowTaxDetails(false);
      setShowBillingDetails(false);
    }
  }, [initialValues, form]);

  const handleSubmit = (values: ExpenseFormValues) => {
    // Include the current receipt URL in the form values
    const formData = {
      ...values,
      receiptUrl: receiptUrl || values.receiptUrl || null
    };
    onSubmit(formData);
  };

  useEffect(() => {
    if (!open) {
      form.reset({
        description: '',
        amount: 0,
        categoryId: 'no-category',
        accountId: 'no-account',
        vendorName: '',
        receiptUrl: '',
        expenseDate: formatDate(new Date()),
        status: 'pending',
        isBillable: false,
        customerId: 'no-customer',
        taxAmount: 0,
        currency: 'NZD',
        gstTreatment: 'standard',
        gstExemptionReason: 'none',
        gstClaimablePercentage: 100,
        privateUsePercentage: 0,
        paymentMethod: undefined,
        notes: ''
      });
      setReceiptUrl(null);
      setReceiptFile(null);
      setShowPaymentDetails(false);
      setShowTaxDetails(false);
      setShowBillingDetails(false);
    }
  }, [open, form]);

  const handleReceiptChange = (url: string | null, file: File | null) => {
    setReceiptUrl(url);
    setReceiptFile(file);
    // Update the form field as well
    form.setValue('receiptUrl', url || '');
  };

  const handleScanComplete = (scanResult: ReceiptScanResult) => {
    // Populate form fields with scanned data
    if (scanResult.merchantName) {
      form.setValue('vendorName', scanResult.merchantName);
    }
    
    if (scanResult.date) {
      form.setValue('expenseDate', scanResult.date);
    }
    
    if (scanResult.total) {
      form.setValue('amount', scanResult.total);
    }
    
    if (scanResult.tax) {
      form.setValue('taxAmount', scanResult.tax);
    }
    
    if (scanResult.paymentMethod) {
      // Map the payment method to form values
      const paymentMethodMap: Record<string, PaymentMethod> = {
        'cash': 'cash',
        'card': 'card',
        'other': 'other'
      };
      const mappedMethod = paymentMethodMap[scanResult.paymentMethod];
      if (mappedMethod) {
        form.setValue('paymentMethod', mappedMethod);
      }
    }
    
    if (scanResult.suggestedCategory) {
      // Try to find a matching category
      const matchingCategory = expenseCategories.find(cat => 
        cat.name.toLowerCase().includes(scanResult.suggestedCategory!.toLowerCase()) ||
        scanResult.suggestedCategory!.toLowerCase().includes(cat.name.toLowerCase())
      );
      if (matchingCategory) {
        form.setValue('categoryId', matchingCategory.id);
      }
    }
    
    if (scanResult.notes) {
      form.setValue('notes', scanResult.notes);
    }
    
    // If we have a good description from merchant name, use it
    if (scanResult.merchantName && !form.getValues('description')) {
      form.setValue('description', `Expense at ${scanResult.merchantName}`);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="drawer-content">
        <DrawerFormLayout
          title={initialValues ? 'Edit Expense' : 'Create Expense'}
          description={
            initialValues 
              ? 'Update the expense details below.' 
              : 'Fill in the expense details below to create a new expense.'
          }
          footer={
            <>
              <Button type="submit" form="expense-form" className="flex-1 h-12">
                {initialValues ? 'Update Expense' : 'Create Expense'}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-12">
                Cancel
              </Button>
            </>
          }
        >
          <Form {...form}>
            <form id="expense-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              
              {/* Basic Expense Information Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-medium text-foreground">Basic Information</h3>
                </div>
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Description *</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="What was this expense for?"
                          className="h-11"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          Amount *
                        </FormLabel>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01" 
                              {...field} 
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="h-11 pl-10"
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expenseDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Date *</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field}
                            className="h-11"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          Category
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="no-category">No category</SelectItem>
                            {expenseCategories.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                <div className="flex items-center gap-2">
                                  {category.color && (
                                    <div 
                                      className="w-3 h-3 rounded-full" 
                                      style={{ backgroundColor: category.color } as React.CSSProperties}
                                    />
                                  )}
                                  {category.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vendorName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium flex items-center gap-1">
                          <Building className="h-3 w-3" />
                          Vendor/Merchant
                        </FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Where did you make this purchase?"
                            className="h-11"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="accountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Account</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select an account" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="no-account">No account</SelectItem>
                          {accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name} ({account.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Receipt Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Receipt className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-medium text-foreground">Receipt & Documents</h3>
                  <div className="flex items-center text-xs text-purple-600 font-medium">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI Scanner Available!
                  </div>
                </div>
                
                <ReceiptUpload
                  onReceiptChange={handleReceiptChange}
                  onScanComplete={handleScanComplete}
                  initialReceiptUrl={receiptUrl}
                  disabled={false}
                />
              </div>

              {/* Payment Details Section - Collapsible */}
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setShowPaymentDetails(!showPaymentDetails)}
                  className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Payment Details</span>
                    <span className="text-xs text-muted-foreground">(Optional)</span>
                  </div>
                  {showPaymentDetails ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                
                <div className={cn(
                  "space-y-4 overflow-hidden transition-all duration-300 ease-in-out",
                  showPaymentDetails ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
                )}>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="paymentMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Payment Method</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="How was this paid?" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="card">Card</SelectItem>
                              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                              <SelectItem value="check">Check</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Tax Details Section - Collapsible */}
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setShowTaxDetails(!showTaxDetails)}
                  className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Tax Information</span>
                    <span className="text-xs text-muted-foreground">(Optional)</span>
                  </div>
                  {showTaxDetails ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                
                <div className={cn(
                  "space-y-4 overflow-hidden transition-all duration-300 ease-in-out",
                  showTaxDetails ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
                )}>
                  <FormField
                    control={form.control}
                    name="taxAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Tax Amount (GST/VAT)</FormLabel>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01" 
                              {...field} 
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="h-11 pl-10"
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* NZ IRD GST Exemption Section - Collapsible */}
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setShowGstExemptionDetails(!showGstExemptionDetails)}
                  className="flex items-center justify-between w-full p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                >
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">🇳🇿 NZ IRD GST Treatment</span>
                    <span className="text-xs text-blue-500">(Vehicle, Entertainment, Exempt)</span>
                  </div>
                  {showGstExemptionDetails ? (
                    <ChevronUp className="h-4 w-4 text-blue-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-blue-500" />
                  )}
                </button>
                
                <div className={cn(
                  "space-y-4 overflow-hidden transition-all duration-300 ease-in-out p-3 bg-blue-50/50 rounded-lg border border-blue-100",
                  showGstExemptionDetails ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0 p-0 border-0"
                )}>
                  {/* GST Treatment Type */}
                  <FormField
                    control={form.control}
                    name="gstTreatment"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">GST Treatment Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select GST treatment" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {gstTreatmentOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* GST Exemption Reason */}
                  <FormField
                    control={form.control}
                    name="gstExemptionReason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Exemption/Adjustment Reason</FormLabel>
                        <Select 
                          onValueChange={(value) => {
                            field.onChange(value);
                            // Auto-update claimable percentage based on reason
                            const reason = gstExemptionReasons.find(r => r.value === value);
                            if (reason) {
                              form.setValue('gstClaimablePercentage', reason.claimablePercent);
                            }
                          }} 
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select reason" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {gstExemptionReasons.map((reason) => (
                              <SelectItem key={reason.value} value={reason.value}>
                                {reason.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Percentage Controls - Only show for partial/private_use treatments */}
                  {(form.watch('gstTreatment') === 'partial' || form.watch('gstTreatment') === 'private_use') && (
                    <div className="grid grid-cols-2 gap-4">
                      {/* Claimable Percentage */}
                      <FormField
                        control={form.control}
                        name="gstClaimablePercentage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">
                              GST Claimable %
                              <span className="ml-2 text-green-600 font-bold">{field.value}%</span>
                            </FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="0"
                                max="100"
                                {...field} 
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                className="h-11"
                              />
                            </FormControl>
                            {form.watch('gstExemptionReason') === 'entertainment_50' && (
                              <p className="text-xs text-amber-600">⚠️ NZ IRD: Entertainment capped at 50%</p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Private Use Percentage */}
                      <FormField
                        control={form.control}
                        name="privateUsePercentage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">
                              Private Use %
                              <span className="ml-2 text-red-600 font-bold">{field.value}%</span>
                            </FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="0"
                                max="100"
                                {...field} 
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                className="h-11"
                              />
                            </FormControl>
                            {form.watch('gstExemptionReason') === 'motor_vehicle' && (
                              <p className="text-xs text-blue-600">🚗 Track logbook for vehicle private use</p>
                            )}
                            {form.watch('gstExemptionReason') === 'home_office' && (
                              <p className="text-xs text-blue-600">🏠 Calculate based on floor area %</p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {/* Effective Claim Summary */}
                  <div className="p-3 bg-white rounded-lg border">
                    <div className="text-sm text-center">
                      <span className="text-muted-foreground">Effective GST Claim: </span>
                      <span className="font-bold text-green-600 text-lg">
                        {(() => {
                          const claimable = form.watch('gstClaimablePercentage') ?? 100;
                          const privateUse = form.watch('privateUsePercentage') ?? 0;
                          const businessUse = 100 - privateUse;
                          return Math.round((claimable / 100) * (businessUse / 100) * 100);
                        })()}%
                      </span>
                      <span className="text-muted-foreground ml-2">
                        ({form.watch('gstClaimablePercentage') ?? 100}% × {100 - (form.watch('privateUsePercentage') ?? 0)}% business use)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Billing Details Section - Collapsible */}
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    const newValue = !showBillingDetails;
                    setShowBillingDetails(newValue);
                    form.setValue('isBillable', newValue);
                  }}
                  className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Client Billing</span>
                    <span className="text-xs text-muted-foreground">(Bill to customer)</span>
                  </div>
                  {showBillingDetails ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                
                <div className={cn(
                  "space-y-4 overflow-hidden transition-all duration-300 ease-in-out",
                  showBillingDetails ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
                )}>
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Customer *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select a customer to bill" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="no-customer">No customer</SelectItem>
                            {customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Notes Section */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Any additional information about this expense..."
                          className="resize-none"
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
        </DrawerFormLayout>
      </DrawerContent>
    </Drawer>
  );
};

export default ExpenseFormDrawer;
