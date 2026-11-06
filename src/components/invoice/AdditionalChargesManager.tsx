import React, { useState } from 'react';
import { Plus, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
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
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AdditionalCharge, AdditionalChargeType, ADDITIONAL_CHARGE_PRESETS } from '@/types';
import { formatCurrency } from '@/utils/invoiceUtils';

const chargeFormSchema = z.object({
  type: z.string().min(1, 'Please select a charge type'),
  label: z.string().min(1, 'Label is required'),
  calculationType: z.enum(['fixed', 'percentage']),
  amount: z.coerce.number().min(0, 'Amount must be positive'),
  description: z.string().optional(),
});

type ChargeFormData = z.infer<typeof chargeFormSchema>;

interface AdditionalChargesManagerProps {
  charges: AdditionalCharge[];
  onChargesChange: (charges: AdditionalCharge[]) => void;
  subtotal: number;
  currency: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

export const AdditionalChargesManager: React.FC<AdditionalChargesManagerProps> = ({
  charges,
  onChargesChange,
  subtotal,
  currency,
  enabled,
  onEnabledChange,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<AdditionalCharge | null>(null);

  const form = useForm<ChargeFormData>({
    resolver: zodResolver(chargeFormSchema),
    defaultValues: {
      type: '',
      label: '',
      calculationType: 'fixed',
      amount: 0,
      description: '',
    },
  });

  const calculateChargeAmount = (charge: AdditionalCharge): number => {
    if (charge.calculationType === 'percentage') {
      return (subtotal * charge.amount) / 100;
    }
    return charge.amount;
  };

  const getTotalAdditionalCharges = (): number => {
    return charges.reduce((total, charge) => {
      if (!charge.isActive) return total;
      return total + calculateChargeAmount(charge);
    }, 0);
  };

  const handleAddCharge = (data: ChargeFormData, event?: React.FormEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    
    const newCharge: AdditionalCharge = {
      id: Date.now().toString(),
      type: data.type as AdditionalChargeType,
      label: data.label,
      calculationType: data.calculationType,
      amount: data.amount,
      description: data.description || '',
      isActive: true,
    };

    onChargesChange([...charges, newCharge]);
    setDialogOpen(false);
    form.reset();
  };

  const handleEditCharge = (data: ChargeFormData, event?: React.FormEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    
    if (!editingCharge) return;

    const updatedCharges = charges.map(charge =>
      charge.id === editingCharge.id
        ? {
            ...charge,
            type: data.type as AdditionalChargeType,
            label: data.label,
            calculationType: data.calculationType,
            amount: data.amount,
            description: data.description || '',
          }
        : charge
    );

    onChargesChange(updatedCharges);
    setEditingCharge(null);
    setDialogOpen(false);
    form.reset();
  };

  const handleDeleteCharge = (chargeId: string) => {
    onChargesChange(charges.filter(charge => charge.id !== chargeId));
  };

  const handleToggleCharge = (chargeId: string) => {
    const updatedCharges = charges.map(charge =>
      charge.id === chargeId
        ? { ...charge, isActive: !charge.isActive }
        : charge
    );
    onChargesChange(updatedCharges);
  };

  const openAddDialog = () => {
    setEditingCharge(null);
    form.reset({
      type: '',
      label: '',
      calculationType: 'fixed',
      amount: 0,
      description: '',
    });
    setDialogOpen(true);
  };

  const openEditDialog = (charge: AdditionalCharge) => {
    setEditingCharge(charge);
    form.reset({
      type: charge.type,
      label: charge.label,
      calculationType: charge.calculationType,
      amount: charge.amount,
      description: charge.description || '',
    });
    setDialogOpen(true);
  };

  const handleTypeChange = (value: string) => {
    const type = value as AdditionalChargeType;
    const preset = ADDITIONAL_CHARGE_PRESETS[type];
    
    form.setValue('type', value);
    
    // Auto-fill label for non-custom types
    if (type !== 'custom' && preset) {
      form.setValue('label', preset.label);
    } else if (type === 'custom') {
      form.setValue('label', '');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Additional Charges</CardTitle>
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            id="additional-charges-toggle"
          />
        </div>
      </CardHeader>
      
      {enabled && (
        <CardContent className="space-y-4">
          {/* Add Charge Button */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openAddDialog();
                }}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Charge
              </Button>
            </DialogTrigger>
            
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingCharge ? 'Edit Additional Charge' : 'Add Additional Charge'}
                </DialogTitle>
                <DialogDescription>
                  Configure an additional charge for this invoice.
                </DialogDescription>
              </DialogHeader>
              
              <Form {...form}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    form.handleSubmit(editingCharge ? handleEditCharge : handleAddCharge)(e);
                  }}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Charge Type</FormLabel>
                        <Select onValueChange={handleTypeChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select charge type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(ADDITIONAL_CHARGE_PRESETS).map(([key, preset]) => (
                              <SelectItem key={key} value={key}>
                                <span className="flex items-center gap-2">
                                  <span>{preset.icon}</span>
                                  <span>{preset.label}</span>
                                </span>
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
                    name="label"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Label</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter charge label" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="calculationType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Calculation</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="fixed">Fixed Amount</SelectItem>
                              <SelectItem value="percentage">Percentage</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {form.watch('calculationType') === 'percentage' ? 'Percentage (%)' : `Amount (${currency})`}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              step={form.watch('calculationType') === 'percentage' ? '0.01' : '0.01'}
                              placeholder={form.watch('calculationType') === 'percentage' ? '5.00' : '25.00'}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Additional details about this charge..."
                            className="resize-none"
                            rows={2}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDialogOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">
                      {editingCharge ? 'Update Charge' : 'Add Charge'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Charges List */}
          {charges.length > 0 && (
            <div className="space-y-2">
              {charges.map((charge) => {
                const calculatedAmount = calculateChargeAmount(charge);
                const preset = ADDITIONAL_CHARGE_PRESETS[charge.type];
                
                return (
                  <div
                    key={charge.id}
                    className={`flex items-center justify-between p-3 border rounded-lg ${
                      charge.isActive ? 'bg-background' : 'bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={charge.isActive}
                        onCheckedChange={() => handleToggleCharge(charge.id)}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{preset?.icon}</span>
                        <div>
                          <div className="font-medium text-sm">{charge.label}</div>
                          {charge.description && (
                            <div className="text-xs text-muted-foreground">{charge.description}</div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="font-medium text-sm">
                          {formatCurrency(calculatedAmount, currency)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {charge.calculationType === 'percentage' 
                            ? `${charge.amount}%` 
                            : 'Fixed'
                          }
                        </div>
                      </div>
                      
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                            onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openEditDialog(charge);
                          }}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                            onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteCharge(charge.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Total */}
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-medium">Total Additional Charges:</span>
                <span className="font-bold">
                  {formatCurrency(getTotalAdditionalCharges(), currency)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default AdditionalChargesManager;