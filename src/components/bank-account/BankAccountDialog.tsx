import React, { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { BankAccount } from '@/types/bankTransaction';
import { bankAccountService } from '@/services/bankAccountService';
import { toast } from 'sonner';

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'business', label: 'Business' },
] as const;

const CURRENCIES = [
  { value: 'NZD', label: 'NZD - New Zealand Dollar' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
] as const;

const formSchema = z.object({
  accountName: z.string().min(1, 'Account name is required').max(255, 'Account name is too long'),
  accountNumber: z.string().min(4, 'Account number must be at least 4 characters').max(50, 'Account number is too long'),
  bankName: z.string().min(1, 'Bank name is required').max(255, 'Bank name is too long'),
  accountType: z.enum(['checking', 'savings', 'credit_card', 'business']),
  currency: z.string().min(3, 'Currency is required').max(3, 'Currency must be 3 characters'),
  openingBalance: z.number().min(-999999999, 'Opening balance is too low').max(999999999, 'Opening balance is too high'),
  currentBalance: z.number().min(-999999999, 'Current balance is too low').max(999999999, 'Current balance is too high'),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface BankAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: BankAccount | null;
  onSaved: () => void;
}

export function BankAccountDialog({ open, onOpenChange, account, onSaved }: BankAccountDialogProps) {
  const [loading, setLoading] = useState(false);
  const isEditing = !!account;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accountName: '',
      accountNumber: '',
      bankName: '',
      accountType: 'checking',
      currency: 'NZD',
      openingBalance: 0,
      currentBalance: 0,
      isActive: true,
    },
  });

  useEffect(() => {
    if (account) {
      form.reset({
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        accountType: account.accountType,
        currency: account.currency,
        openingBalance: account.openingBalance,
        currentBalance: account.currentBalance,
        isActive: account.isActive,
      });
    } else {
      form.reset({
        accountName: '',
        accountNumber: '',
        bankName: '',
        accountType: 'checking',
        currency: 'NZD',
        openingBalance: 0,
        currentBalance: 0,
        isActive: true,
      });
    }
  }, [account, form]);

  const onSubmit = async (data: FormData) => {
    try {
      setLoading(true);

      // Validate the data using our service validation
      const accountData = { accountName: data.accountName, accountNumber: data.accountNumber, bankName: data.bankName, accountType: data.accountType, currency: data.currency, openingBalance: data.openingBalance, currentBalance: data.currentBalance, isActive: data.isActive };
      bankAccountService.validateBankAccount(accountData);

      if (isEditing) {
        await bankAccountService.updateBankAccount(account.id, accountData);
        toast.success('Bank account updated successfully');
      } else {
        await bankAccountService.createBankAccount(accountData);
        toast.success('Bank account created successfully');
      }

      onSaved();
    } catch (error) {
      console.error('Error saving bank account:', error);
      const message = error instanceof Error ? error.message : 'Failed to save bank account';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!loading) {
      onOpenChange(newOpen);
    }
  };

  // Check if account type allows negative balances
  const accountType = form.watch('accountType');
  const allowsNegativeBalance = accountType === 'credit_card';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Bank Account' : 'Add Bank Account'}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Update the bank account details below.'
              : 'Add a new bank account for transaction imports and reconciliation.'
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="accountName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Checking Account" {...field} />
                    </FormControl>
                    <FormDescription>
                      A descriptive name for this account
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl>
                      <Input placeholder="ANZ Bank" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="accountNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Number</FormLabel>
                    <FormControl>
                      <Input placeholder="12-3456-7890123-00" {...field} />
                    </FormControl>
                    <FormDescription>
                      Your bank account number (min 4 characters)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCIES.map((currency) => (
                          <SelectItem key={currency.value} value={currency.value}>
                            {currency.label}
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
                name="openingBalance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opening Balance</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currentBalance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Balance</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      {allowsNegativeBalance 
                        ? 'Negative balances allowed for credit cards'
                        : 'Must be positive for non-credit accounts'
                      }
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active Account</FormLabel>
                    <FormDescription>
                      Active accounts can be used for transaction imports and reconciliation
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    {isEditing ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  isEditing ? 'Update Account' : 'Create Account'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}