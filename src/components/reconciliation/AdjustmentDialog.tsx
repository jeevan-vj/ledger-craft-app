/**
 * Adjustment Dialog
 * 
 * Dialog for adding reconciliation adjustments like:
 * - Outstanding checks
 * - Deposits in transit
 * - Bank fees
 * - Interest earned
 * - Errors
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { reconciliationService } from '@/services/reconciliationService';
import { AdjustmentType } from '@/types/reconciliation';

interface AdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  onAdjustmentCreated: () => void;
}

const ADJUSTMENT_TYPES: { value: AdjustmentType; label: string; description: string; affectsBank: boolean; affectsBook: boolean }[] = [
  {
    value: 'outstanding_check',
    label: 'Outstanding Check',
    description: 'Check written but not yet cleared by the bank',
    affectsBank: true,
    affectsBook: false,
  },
  {
    value: 'deposit_in_transit',
    label: 'Deposit in Transit',
    description: 'Deposit made but not yet credited by the bank',
    affectsBank: true,
    affectsBook: false,
  },
  {
    value: 'bank_fee',
    label: 'Bank Fee',
    description: 'Bank service charge not recorded in books',
    affectsBank: false,
    affectsBook: true,
  },
  {
    value: 'interest_earned',
    label: 'Interest Earned',
    description: 'Interest credited by bank not recorded in books',
    affectsBank: false,
    affectsBook: true,
  },
  {
    value: 'bank_error',
    label: 'Bank Error',
    description: 'Error made by the bank',
    affectsBank: true,
    affectsBook: false,
  },
  {
    value: 'book_error',
    label: 'Book Error',
    description: 'Error in company records',
    affectsBank: false,
    affectsBook: true,
  },
  {
    value: 'nsf_check',
    label: 'NSF Check',
    description: 'Non-sufficient funds check returned',
    affectsBank: false,
    affectsBook: true,
  },
  {
    value: 'other',
    label: 'Other Adjustment',
    description: 'Other reconciling item',
    affectsBank: false,
    affectsBook: false,
  },
];

export function AdjustmentDialog({
  open,
  onOpenChange,
  sessionId,
  onAdjustmentCreated,
}: AdjustmentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('outstanding_check');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [affectsBank, setAffectsBank] = useState(true);
  const [affectsBook, setAffectsBook] = useState(false);

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setAdjustmentType('outstanding_check');
      setDescription('');
      setAmount('');
      setReferenceNumber('');
      setAffectsBank(true);
      setAffectsBook(false);
      setError(null);
    }
  }, [open]);

  // Update affects flags when type changes
  React.useEffect(() => {
    const typeConfig = ADJUSTMENT_TYPES.find(t => t.value === adjustmentType);
    if (typeConfig) {
      setAffectsBank(typeConfig.affectsBank);
      setAffectsBook(typeConfig.affectsBook);
    }
  }, [adjustmentType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!description.trim()) {
      setError('Please enter a description');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      await reconciliationService.createAdjustment(sessionId, {
        adjustmentType,
        description: description.trim(),
        amount: parseFloat(amount),
        affectsBank,
        affectsBook,
        referenceNumber: referenceNumber.trim() || undefined,
      });

      // Apply immediately
      // Note: In a real app, you might want to allow pending adjustments
      
      onAdjustmentCreated();
      onOpenChange(false);
      toast.success('Adjustment added successfully');
    } catch (err) {
      console.error('Error creating adjustment:', err);
      setError(err instanceof Error ? err.message : 'Failed to create adjustment');
    } finally {
      setLoading(false);
    }
  };

  const selectedType = ADJUSTMENT_TYPES.find(t => t.value === adjustmentType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Reconciliation Adjustment</DialogTitle>
            <DialogDescription>
              Record items that explain differences between bank and book balances
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Adjustment Type */}
            <div className="space-y-2">
              <Label htmlFor="type">Adjustment Type</Label>
              <Select value={adjustmentType} onValueChange={(v) => setAdjustmentType(v as AdjustmentType)}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedType && (
                <p className="text-xs text-muted-foreground">{selectedType.description}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Enter a description for this adjustment"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                required
              />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="pl-7"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Reference Number */}
            <div className="space-y-2">
              <Label htmlFor="reference">Reference Number (Optional)</Label>
              <Input
                id="reference"
                placeholder="Check number, deposit slip #, etc."
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
            </div>

            {/* Affects indicators */}
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium mb-2">This adjustment will:</p>
              <div className="space-y-1 text-sm">
                {affectsBank && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>Adjust the bank balance</span>
                  </div>
                )}
                {affectsBook && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span>Adjust the book balance</span>
                  </div>
                )}
                {!affectsBank && !affectsBook && adjustmentType === 'other' && (
                  <p className="text-muted-foreground">
                    For "Other" adjustments, specify which balance it affects.
                  </p>
                )}
              </div>
            </div>

            {/* Manual selection for 'other' type */}
            {adjustmentType === 'other' && (
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={affectsBank}
                    onChange={(e) => setAffectsBank(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">Affects Bank Balance</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={affectsBook}
                    onChange={(e) => setAffectsBook(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">Affects Book Balance</span>
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

