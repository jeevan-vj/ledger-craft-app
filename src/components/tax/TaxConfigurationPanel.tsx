import React, { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Calculator, 
  Settings, 
  Plus, 
  Edit, 
  Trash2, 
  AlertTriangle,
  CheckCircle,
  Info,
  Calendar,
  Percent,
  Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { TaxConfiguration } from '@/types/payment';

const taxConfigSchema = z.object({
  taxType: z.enum(['GST', 'VAT', 'Sales_Tax']),
  taxRate: z.number().min(0).max(1, 'Tax rate must be between 0% and 100%'),
  taxName: z.string().min(1, 'Tax name is required'),
  appliesToServices: z.boolean(),
  appliesToGoods: z.boolean(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional(),
  countryCode: z.string().min(2).max(3)
});

interface TaxConfigurationPanelProps {
  configurations: TaxConfiguration[];
  onSave: (config: Omit<TaxConfiguration, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdate: (id: string, config: Partial<TaxConfiguration>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isLoading?: boolean;
}

export function TaxConfigurationPanel({
  configurations,
  onSave,
  onUpdate,
  onDelete,
  isLoading = false
}: TaxConfigurationPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<TaxConfiguration | null>(null);

  const form = useForm<z.infer<typeof taxConfigSchema>>({
    resolver: zodResolver(taxConfigSchema),
    defaultValues: {
      taxType: 'GST',
      taxRate: 0.15, // Default NZ GST rate
      taxName: 'GST',
      appliesToServices: true,
      appliesToGoods: true,
      effectiveFrom: new Date().toISOString().split('T')[0],
      countryCode: 'NZ'
    }
  });

  const activeConfig = configurations.find(config => config.isActive);
  const historicalConfigs = configurations.filter(config => !config.isActive);

  const handleSubmit = async (data: z.infer<typeof taxConfigSchema>) => {
    try {
      const configData = {
        taxType: data.taxType, taxRate: data.taxRate, taxName: data.taxName,
        countryCode: data.countryCode, appliesToServices: data.appliesToServices,
        appliesToGoods: data.appliesToGoods, effectiveFrom: data.effectiveFrom, effectiveTo: data.effectiveTo,
        isActive: true // New configurations are active by default
      };

      if (editingConfig) {
        await onUpdate(editingConfig.id, configData);
      } else {
        await onSave(configData);
      }

      setShowForm(false);
      setEditingConfig(null);
      form.reset();
    } catch (error) {
      console.error('Failed to save tax configuration:', error);
    }
  };

  const handleEdit = (config: TaxConfiguration) => {
    setEditingConfig(config);
    form.reset({
      taxType: config.taxType,
      taxRate: config.taxRate,
      taxName: config.taxName,
      appliesToServices: config.appliesToServices,
      appliesToGoods: config.appliesToGoods,
      effectiveFrom: config.effectiveFrom.split('T')[0],
      effectiveTo: config.effectiveTo?.split('T')[0],
      countryCode: config.countryCode
    });
    setShowForm(true);
  };

  const handleDeactivate = async (config: TaxConfiguration) => {
    await onUpdate(config.id, { isActive: false });
  };

  const getTaxRateDisplay = (rate: number) => {
    return `${(rate * 100).toFixed(1)}%`;
  };

  const getCountryFlag = (countryCode: string) => {
    const flags: Record<string, string> = {
      'NZ': '🇳🇿',
      'AU': '🇦🇺',
      'GB': '🇬🇧',
      'US': '🇺🇸',
      'CA': '🇨🇦'
    };
    return flags[countryCode] || '🌍';
  };

  return (
    <div className="space-y-6">
      {/* Current Tax Configuration */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Current Tax Configuration
            </CardTitle>
            
            <Dialog open={showForm} onOpenChange={setShowForm}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Configuration
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingConfig ? 'Edit Tax Configuration' : 'New Tax Configuration'}
                  </DialogTitle>
                </DialogHeader>
                <TaxConfigurationForm
                  form={form}
                  onSubmit={handleSubmit}
                  onCancel={() => {
                    setShowForm(false);
                    setEditingConfig(null);
                    form.reset();
                  }}
                  isLoading={isLoading}
                  isEditing={!!editingConfig}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {activeConfig ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getCountryFlag(activeConfig.countryCode)}</span>
                    <div>
                      <p className="font-semibold text-lg">{activeConfig.taxName}</p>
                      <p className="text-sm text-muted-foreground">
                        {activeConfig.countryCode} {activeConfig.taxType}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Tax Rate</p>
                  <p className="text-3xl font-bold text-blue-600">
                    {getTaxRateDisplay(activeConfig.taxRate)}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Effective From</p>
                  <p className="font-medium">
                    {format(new Date(activeConfig.effectiveFrom), 'dd MMM yyyy')}
                  </p>
                  {activeConfig.effectiveTo && (
                    <p className="text-sm text-red-600">
                      Expires: {format(new Date(activeConfig.effectiveTo), 'dd MMM yyyy')}
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Applies to Services</span>
                  <Badge variant={activeConfig.appliesToServices ? "default" : "secondary"}>
                    {activeConfig.appliesToServices ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Applies to Goods</span>
                  <Badge variant={activeConfig.appliesToGoods ? "default" : "secondary"}>
                    {activeConfig.appliesToGoods ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(activeConfig)}
                  className="gap-1"
                >
                  <Edit className="h-3 w-3" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeactivate(activeConfig)}
                  className="gap-1 text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                  Deactivate
                </Button>
              </div>
            </div>
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No active tax configuration found. Please create a new configuration to enable tax calculations.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Tax Calculation Preview */}
      {activeConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5" />
              Tax Calculation Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TaxCalculationPreview taxConfig={activeConfig} />
          </CardContent>
        </Card>
      )}

      {/* Configuration History */}
      {historicalConfigs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Configuration History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tax Type</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Effective Period</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historicalConfigs.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{getCountryFlag(config.countryCode)}</span>
                          {config.taxName}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {getTaxRateDisplay(config.taxRate)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>From: {format(new Date(config.effectiveFrom), 'dd MMM yyyy')}</p>
                          {config.effectiveTo && (
                            <p>To: {format(new Date(config.effectiveTo), 'dd MMM yyyy')}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{config.countryCode}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Inactive</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onUpdate(config.id, { isActive: true })}
                          >
                            Reactivate
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(config.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Information */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-medium">Tax Configuration Guidelines</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Only one tax configuration can be active at a time</li>
                <li>• Changes take effect immediately for new transactions</li>
                <li>• Historical configurations are preserved for reporting</li>
                <li>• Tax rates should be entered as decimals (e.g., 0.15 for 15%)</li>
                <li>• Effective dates help track tax rate changes over time</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Tax Configuration Form Component
function TaxConfigurationForm({
  form,
  onSubmit,
  onCancel,
  isLoading,
  isEditing
}: {
  form: UseFormReturn<z.infer<typeof taxConfigSchema>>;
  onSubmit: (data: z.infer<typeof taxConfigSchema>) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  isEditing: boolean;
}) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="countryCode">Country</Label>
          <Select 
            value={form.watch('countryCode')} 
            onValueChange={(value) => form.setValue('countryCode', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NZ">🇳🇿 New Zealand</SelectItem>
              <SelectItem value="AU">🇦🇺 Australia</SelectItem>
              <SelectItem value="GB">🇬🇧 United Kingdom</SelectItem>
              <SelectItem value="US">🇺🇸 United States</SelectItem>
              <SelectItem value="CA">🇨🇦 Canada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="taxType">Tax Type</Label>
          <Select 
            value={form.watch('taxType')} 
            onValueChange={(value) => form.setValue('taxType', value as z.infer<typeof taxConfigSchema>['taxType'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GST">GST (Goods and Services Tax)</SelectItem>
              <SelectItem value="VAT">VAT (Value Added Tax)</SelectItem>
              <SelectItem value="Sales_Tax">Sales Tax</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="taxName">Tax Name</Label>
          <Input
            id="taxName"
            placeholder="e.g., GST, VAT, Sales Tax"
            {...form.register('taxName')}
          />
          {form.formState.errors.taxName && (
            <p className="text-sm text-red-600">{form.formState.errors.taxName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="taxRate">Tax Rate (%)</Label>
          <div className="relative">
            <Input
              id="taxRate"
              type="number"
              step="0.001"
              min="0"
              max="1"
              placeholder="0.15"
              {...form.register('taxRate', { valueAsNumber: true })}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
              {form.watch('taxRate') ? `${(form.watch('taxRate') * 100).toFixed(1)}%` : '%'}
            </span>
          </div>
          {form.formState.errors.taxRate && (
            <p className="text-sm text-red-600">{form.formState.errors.taxRate.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="effectiveFrom">Effective From</Label>
          <Input
            id="effectiveFrom"
            type="date"
            {...form.register('effectiveFrom')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="effectiveTo">Effective To (Optional)</Label>
          <Input
            id="effectiveTo"
            type="date"
            {...form.register('effectiveTo')}
          />
        </div>
      </div>

      <div className="space-y-4">
        <Label>Applies To</Label>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="appliesToServices" className="font-normal">
              Services
            </Label>
            <Switch
              id="appliesToServices"
              checked={form.watch('appliesToServices')}
              onCheckedChange={(checked) => form.setValue('appliesToServices', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="appliesToGoods" className="font-normal">
              Goods/Products
            </Label>
            <Switch
              id="appliesToGoods"
              checked={form.watch('appliesToGoods')}
              onCheckedChange={(checked) => form.setValue('appliesToGoods', checked)}
            />
          </div>
        </div>
      </div>

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
          className="flex-1"
        >
          {isLoading ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle className="mr-2 h-4 w-4" />
              {isEditing ? 'Update Configuration' : 'Save Configuration'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// Tax Calculation Preview Component
function TaxCalculationPreview({ taxConfig }: { taxConfig: TaxConfiguration }) {
  const [amount, setAmount] = useState(100);
  const [isInclusive, setIsInclusive] = useState(true);

  const calculateTax = () => {
    if (isInclusive) {
      // Tax-inclusive calculation
      const subtotal = amount / (1 + taxConfig.taxRate);
      const taxAmount = amount - subtotal;
      return { subtotal, taxAmount, total: amount };
    } else {
      // Tax-exclusive calculation
      const subtotal = amount;
      const taxAmount = amount * taxConfig.taxRate;
      const total = amount + taxAmount;
      return { subtotal, taxAmount, total };
    }
  };

  const { subtotal, taxAmount, total } = calculateTax();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount ($)</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-2">
          <Label>Tax Calculation</Label>
          <div className="flex items-center space-x-2">
            <Switch
              checked={isInclusive}
              onCheckedChange={setIsInclusive}
            />
            <span className="text-sm">
              {isInclusive ? 'Tax Inclusive' : 'Tax Exclusive'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-muted p-4 rounded-lg space-y-3">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>{taxConfig.taxName} ({(taxConfig.taxRate * 100).toFixed(1)}%):</span>
          <span>${taxAmount.toFixed(2)}</span>
        </div>
        <Separator />
        <div className="flex justify-between font-bold">
          <span>Total:</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}