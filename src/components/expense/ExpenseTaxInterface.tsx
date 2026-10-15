import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calculator,
  Receipt,
  Building2,
  Wrench,
  AlertTriangle,
  Info,
  CheckCircle,
  DollarSign,
  Calendar,
  FileText,
  Zap,
  PiggyBank,
  Shield,
  Car,
  Home,
  Percent
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from "@/context/StableAuthContext";
import { supabaseDataService } from '@/services/supabaseDataService';

// NZ IRD GST Treatment Types
type GstTreatmentType = 'standard' | 'zero_rated' | 'exempt' | 'partial' | 'private_use';

// NZ IRD GST Exemption Reasons
type GstExemptionReason = 
  | 'none'
  | 'motor_vehicle'           // Special rules for vehicles >$10k
  | 'financial_services'      // Exempt - bank fees, interest
  | 'residential_rent'        // Exempt - residential accommodation
  | 'insurance_life'          // Exempt - life insurance
  | 'exported_services'       // Zero-rated - exports
  | 'entertainment_50'        // 50% claimable - entertainment
  | 'home_office'             // Partial - private use adjustment
  | 'second_hand_goods'       // Special rules - no tax invoice
  | 'other_exempt';           // Other IRD exempt supplies

interface ExpenseFormData {
  description: string;
  amount: number;
  category: string;
  subcategory: string;
  date: string;
  isCapitalExpense: boolean;
  isGstClaimable: boolean;
  gstAmount: number;
  netAmount: number;
  receiptNumber?: string;
  notes?: string;
  supplier?: string;
  // New GST exemption fields
  gstTreatment: GstTreatmentType;
  gstExemptionReason: GstExemptionReason;
  gstClaimablePercentage: number; // 0-100% for partial claims
  privateUsePercentage: number;   // For home office, vehicle private use
}

interface TaxCategory {
  id: string;
  name: string;
  description: string;
  isCapitalDefault: boolean;
  gstClaimable: boolean;
  subcategories: string[];
}

interface ExpenseTaxInterfaceProps {
  expense?: ExpenseFormData;
  onSave: (expenseData: ExpenseFormData) => void;
  onCancel: () => void;
  className?: string;
}

export const ExpenseTaxInterface: React.FC<ExpenseTaxInterfaceProps> = ({
  expense,
  onSave,
  onCancel,
  className
}) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState<ExpenseFormData>({
    description: '',
    amount: 0,
    category: '',
    subcategory: '',
    date: new Date().toISOString().split('T')[0],
    isCapitalExpense: false,
    isGstClaimable: true,
    gstAmount: 0,
    netAmount: 0,
    receiptNumber: '',
    notes: '',
    supplier: '',
    // GST exemption defaults
    gstTreatment: 'standard',
    gstExemptionReason: 'none',
    gstClaimablePercentage: 100,
    privateUsePercentage: 0,
    ...expense
  });

  const [taxRate, setTaxRate] = useState(0.15); // Default GST rate for NZ
  const [isAmountIncludingGst, setIsAmountIncludingGst] = useState(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // NZ IRD GST exemption descriptions for user guidance
  const gstExemptionDescriptions: Record<GstExemptionReason, { label: string; description: string; claimablePercent: number }> = {
    none: { label: 'Fully Claimable', description: 'Standard GST - 100% claimable', claimablePercent: 100 },
    motor_vehicle: { label: 'Motor Vehicle', description: 'Special rules apply for vehicles over $10,000. Private use portion not claimable.', claimablePercent: 100 },
    financial_services: { label: 'Financial Services (Exempt)', description: 'Bank fees, interest, life insurance premiums are GST exempt', claimablePercent: 0 },
    residential_rent: { label: 'Residential Rent (Exempt)', description: 'Residential accommodation is GST exempt', claimablePercent: 0 },
    insurance_life: { label: 'Life Insurance (Exempt)', description: 'Life insurance premiums are GST exempt', claimablePercent: 0 },
    exported_services: { label: 'Zero-Rated (Exports)', description: 'Services exported outside NZ - zero-rated but claimable', claimablePercent: 100 },
    entertainment_50: { label: 'Entertainment (50%)', description: 'Entertainment expenses - only 50% GST claimable per IRD rules', claimablePercent: 50 },
    home_office: { label: 'Home Office', description: 'Business portion only - adjust for private use', claimablePercent: 100 },
    second_hand_goods: { label: 'Second-hand Goods', description: 'No tax invoice required - special rules apply', claimablePercent: 100 },
    other_exempt: { label: 'Other Exempt', description: 'Other IRD exempt supplies - no GST claimable', claimablePercent: 0 }
  };

  // Predefined tax categories with GST claimability rules
  const taxCategories: TaxCategory[] = [
    {
      id: 'office',
      name: 'Office & Administration',
      description: 'Office supplies, stationery, software subscriptions',
      isCapitalDefault: false,
      gstClaimable: true,
      subcategories: ['Stationery', 'Software', 'Postage', 'Office Rent', 'Utilities']
    },
    {
      id: 'travel',
      name: 'Travel & Transport',
      description: 'Business travel, vehicle expenses, fuel',
      isCapitalDefault: false,
      gstClaimable: true,
      subcategories: ['Fuel', 'Parking', 'Accommodation', 'Flights', 'Vehicle Maintenance']
    },
    {
      id: 'motor_vehicle',
      name: '🚗 Motor Vehicle Purchase',
      description: 'Vehicle purchase over $10,000 - special GST rules apply',
      isCapitalDefault: true,
      gstClaimable: true,
      subcategories: ['Car Purchase', 'Truck Purchase', 'Van Purchase', 'Motorcycle', 'Vehicle Lease']
    },
    {
      id: 'equipment',
      name: 'Equipment & Machinery',
      description: 'Tools, machinery, computer equipment',
      isCapitalDefault: true,
      gstClaimable: true,
      subcategories: ['Computers', 'Machinery', 'Tools', 'Furniture', 'Software Licenses']
    },
    {
      id: 'marketing',
      name: 'Marketing & Advertising',
      description: 'Advertising, promotions, website costs',
      isCapitalDefault: false,
      gstClaimable: true,
      subcategories: ['Online Ads', 'Print Advertising', 'Website', 'Promotions', 'Branding']
    },
    {
      id: 'professional',
      name: 'Professional Services',
      description: 'Legal, accounting, consulting fees',
      isCapitalDefault: false,
      gstClaimable: true,
      subcategories: ['Legal Fees', 'Accounting', 'Consulting', 'Banking Fees', 'Insurance']
    },
    {
      id: 'financial',
      name: '🏦 Financial Services (Exempt)',
      description: 'Bank fees, interest, insurance - GST exempt',
      isCapitalDefault: false,
      gstClaimable: false,
      subcategories: ['Bank Fees', 'Interest Paid', 'Life Insurance', 'Credit Card Fees', 'Loan Fees']
    },
    {
      id: 'entertainment',
      name: '🍽️ Entertainment & Meals (50%)',
      description: 'Business meals, client entertainment - 50% GST claimable',
      isCapitalDefault: false,
      gstClaimable: true, // But only 50%
      subcategories: ['Client Meals', 'Business Entertainment', 'Staff Functions', 'Conference Meals']
    },
    {
      id: 'home_office',
      name: '🏠 Home Office',
      description: 'Working from home expenses - adjust for private use',
      isCapitalDefault: false,
      gstClaimable: true,
      subcategories: ['Internet', 'Phone', 'Electricity', 'Heating', 'Home Office Equipment']
    },
    {
      id: 'rent_residential',
      name: '🏘️ Residential Rent (Exempt)',
      description: 'Residential accommodation - GST exempt',
      isCapitalDefault: false,
      gstClaimable: false,
      subcategories: ['Residential Rent', 'Accommodation Deposit', 'Residential Lease']
    }
  ];

  useEffect(() => {
    // Load tax configuration
    const loadTaxConfig = async () => {
      if (user?.id) {
        try {
          const config = await supabaseDataService.getTaxConfiguration(user.id);
          if (config) {
            setTaxRate(config.taxRate);
          }
        } catch (error) {
          console.error('Failed to load tax configuration:', error);
        }
      }
    };
    loadTaxConfig();
  }, [user?.id]);

  // Calculate GST amounts when relevant fields change
  useEffect(() => {
    calculateGstAmounts();
  }, [formData.amount, formData.isGstClaimable, formData.gstTreatment, formData.gstClaimablePercentage, formData.privateUsePercentage, taxRate, isAmountIncludingGst]);

  const calculateGstAmounts = () => {
    // Check if GST is claimable based on treatment type
    const isExempt = formData.gstTreatment === 'exempt';
    const isZeroRated = formData.gstTreatment === 'zero_rated';
    
    if (!formData.isGstClaimable || formData.amount <= 0 || isExempt) {
      setFormData(prev => ({
        ...prev,
        gstAmount: 0,
        netAmount: formData.amount
      }));
      return;
    }

    let gstAmount: number;
    let netAmount: number;

    if (isAmountIncludingGst) {
      // Amount includes GST - extract GST
      netAmount = formData.amount / (1 + taxRate);
      gstAmount = formData.amount - netAmount;
    } else {
      // Amount excludes GST - add GST
      netAmount = formData.amount;
      gstAmount = formData.amount * taxRate;
    }

    // Apply claimable percentage (e.g., 50% for entertainment)
    const claimablePercent = formData.gstClaimablePercentage / 100;
    
    // Apply private use adjustment (reduce claim by private use %)
    const businessUsePercent = (100 - formData.privateUsePercentage) / 100;
    
    // Final claimable GST = base GST × claimable% × business use%
    const claimableGst = gstAmount * claimablePercent * businessUsePercent;

    setFormData(prev => ({
      ...prev,
      gstAmount: Math.round(claimableGst * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100
    }));
  };

  const handleCategoryChange = (categoryId: string) => {
    const category = taxCategories.find(c => c.id === categoryId);
    if (category) {
      // Auto-set GST treatment based on category
      let gstTreatment: GstTreatmentType = 'standard';
      let gstExemptionReason: GstExemptionReason = 'none';
      let gstClaimablePercentage = 100;
      let privateUsePercentage = 0;

      // Map categories to GST treatment
      switch (categoryId) {
        case 'motor_vehicle':
          gstTreatment = 'partial';
          gstExemptionReason = 'motor_vehicle';
          privateUsePercentage = 20; // Default 20% private use for vehicles
          break;
        case 'financial':
          gstTreatment = 'exempt';
          gstExemptionReason = 'financial_services';
          gstClaimablePercentage = 0;
          break;
        case 'entertainment':
          gstTreatment = 'partial';
          gstExemptionReason = 'entertainment_50';
          gstClaimablePercentage = 50; // NZ IRD 50% rule
          break;
        case 'home_office':
          gstTreatment = 'partial';
          gstExemptionReason = 'home_office';
          privateUsePercentage = 50; // Default 50% private use for home office
          break;
        case 'rent_residential':
          gstTreatment = 'exempt';
          gstExemptionReason = 'residential_rent';
          gstClaimablePercentage = 0;
          break;
        default:
          gstTreatment = 'standard';
          gstExemptionReason = 'none';
          gstClaimablePercentage = 100;
      }

      setFormData(prev => ({
        ...prev,
        category: categoryId,
        subcategory: '',
        isCapitalExpense: category.isCapitalDefault,
        isGstClaimable: category.gstClaimable,
        gstTreatment,
        gstExemptionReason,
        gstClaimablePercentage,
        privateUsePercentage
      }));
    }
  };

  const validateForm = (): boolean => {
    const errors: string[] = [];

    if (!formData.description.trim()) {
      errors.push('Description is required');
    }
    if (formData.amount <= 0) {
      errors.push('Amount must be greater than zero');
    }
    if (!formData.category) {
      errors.push('Category is required');
    }
    if (!formData.date) {
      errors.push('Date is required');
    }

    // Business rule validations
    if (formData.isCapitalExpense && formData.amount < 500) {
      errors.push('Capital expenses are typically $500 or more');
    }

    if (formData.category === 'entertainment' && formData.isGstClaimable) {
      errors.push('Entertainment expenses have limited GST claimability (50% rule)');
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onSave(formData);
    }
  };

  const selectedCategory = taxCategories.find(c => c.id === formData.category);
  const totalAmount = isAmountIncludingGst ? formData.amount : formData.netAmount + formData.gstAmount;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-600" />
            {expense ? 'Edit Expense' : 'Add New Expense'}
            <Badge variant="outline" className="ml-auto">
              GST Smart Calculator
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="e.g., Office supplies from Warehouse Stationery"
              />
            </div>

            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                value={formData.supplier}
                onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                placeholder="e.g., Warehouse Stationery"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="receipt">Receipt #</Label>
                <Input
                  id="receipt"
                  value={formData.receiptNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, receiptNumber: e.target.value }))}
                  placeholder="Receipt number"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes about this expense"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tax Classification */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Tax Classification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select expense category" />
                </SelectTrigger>
                <SelectContent>
                  {taxCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <span>{category.name}</span>
                        <Badge variant={category.gstClaimable ? "default" : "secondary"} className="text-xs">
                          {category.gstClaimable ? "GST Claimable" : "Limited GST"}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategory && (
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedCategory.description}
                </p>
              )}
            </div>

            {selectedCategory && (
              <div>
                <Label htmlFor="subcategory">Subcategory</Label>
                <Select 
                  value={formData.subcategory} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, subcategory: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedCategory.subcategories.map((sub) => (
                      <SelectItem key={sub} value={sub}>
                        {sub}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  <Label htmlFor="capital">Capital Expense</Label>
                </div>
                <Switch
                  id="capital"
                  checked={formData.isCapitalExpense}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isCapitalExpense: checked }))}
                />
              </div>
              {formData.isCapitalExpense && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Capital expenses may require different depreciation treatment
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <Label htmlFor="gst-claimable">GST Claimable</Label>
                </div>
                <Switch
                  id="gst-claimable"
                  checked={formData.isGstClaimable}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isGstClaimable: checked }))}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* NZ IRD GST Treatment Section */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600" />
            🇳🇿 NZ IRD GST Treatment
            <Badge variant="outline" className="ml-auto bg-white">
              {formData.gstTreatment === 'standard' && '✅ Standard 15%'}
              {formData.gstTreatment === 'zero_rated' && '0️⃣ Zero-Rated'}
              {formData.gstTreatment === 'exempt' && '⛔ Exempt'}
              {formData.gstTreatment === 'partial' && '⚠️ Partial Claim'}
              {formData.gstTreatment === 'private_use' && '🏠 Private Use'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* GST Treatment Type */}
            <div>
              <Label htmlFor="gst-treatment">GST Treatment Type</Label>
              <Select 
                value={formData.gstTreatment} 
                onValueChange={(value: GstTreatmentType) => {
                  const isExempt = value === 'exempt';
                  setFormData(prev => ({ 
                    ...prev, 
                    gstTreatment: value,
                    isGstClaimable: !isExempt,
                    gstClaimablePercentage: isExempt ? 0 : prev.gstClaimablePercentage
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select GST treatment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">✅ Standard (15% fully claimable)</SelectItem>
                  <SelectItem value="zero_rated">0️⃣ Zero-Rated (0% but claimable)</SelectItem>
                  <SelectItem value="exempt">⛔ Exempt (No GST)</SelectItem>
                  <SelectItem value="partial">⚠️ Partial (Limited claim %)</SelectItem>
                  <SelectItem value="private_use">🏠 Private Use Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Exemption Reason */}
            <div>
              <Label htmlFor="exemption-reason">Exemption/Adjustment Reason</Label>
              <Select 
                value={formData.gstExemptionReason} 
                onValueChange={(value: GstExemptionReason) => {
                  const exemptionInfo = gstExemptionDescriptions[value];
                  setFormData(prev => ({ 
                    ...prev, 
                    gstExemptionReason: value,
                    gstClaimablePercentage: exemptionInfo.claimablePercent
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(gstExemptionDescriptions).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.label} ({info.claimablePercent}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.gstExemptionReason !== 'none' && (
                <p className="text-xs text-muted-foreground mt-1">
                  ℹ️ {gstExemptionDescriptions[formData.gstExemptionReason].description}
                </p>
              )}
            </div>
          </div>

          {/* Percentage Adjustments */}
          {(formData.gstTreatment === 'partial' || formData.gstTreatment === 'private_use') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
              {/* Claimable Percentage */}
              <div>
                <Label htmlFor="claimable-percent">
                  GST Claimable Percentage
                  <span className="text-muted-foreground ml-2">({formData.gstClaimablePercentage}%)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="claimable-percent"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={formData.gstClaimablePercentage}
                    onChange={(e) => setFormData(prev => ({ ...prev, gstClaimablePercentage: Number(e.target.value) }))}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.gstClaimablePercentage}
                    onChange={(e) => setFormData(prev => ({ ...prev, gstClaimablePercentage: Number(e.target.value) }))}
                    className="w-20"
                  />
                </div>
                {formData.gstExemptionReason === 'entertainment_50' && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ NZ IRD Rule: Entertainment capped at 50%</p>
                )}
              </div>

              {/* Private Use Percentage */}
              <div>
                <Label htmlFor="private-use-percent">
                  Private Use Percentage (Non-claimable)
                  <span className="text-muted-foreground ml-2">({formData.privateUsePercentage}%)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="private-use-percent"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={formData.privateUsePercentage}
                    onChange={(e) => setFormData(prev => ({ ...prev, privateUsePercentage: Number(e.target.value) }))}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.privateUsePercentage}
                    onChange={(e) => setFormData(prev => ({ ...prev, privateUsePercentage: Number(e.target.value) }))}
                    className="w-20"
                  />
                </div>
                {formData.gstExemptionReason === 'motor_vehicle' && (
                  <p className="text-xs text-blue-600 mt-1">🚗 Track logbook % for vehicle private use</p>
                )}
                {formData.gstExemptionReason === 'home_office' && (
                  <p className="text-xs text-blue-600 mt-1">🏠 Calculate based on floor area % used for business</p>
                )}
              </div>
            </div>
          )}

          {/* GST Calculation Summary */}
          <Alert className="bg-white border-blue-200">
            <Calculator className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Claimable:</span>
                  <span className="font-medium ml-1">{formData.gstClaimablePercentage}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Business Use:</span>
                  <span className="font-medium ml-1">{100 - formData.privateUsePercentage}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Effective Claim:</span>
                  <span className="font-bold text-green-600 ml-1">
                    {Math.round((formData.gstClaimablePercentage / 100) * ((100 - formData.privateUsePercentage) / 100) * 100)}%
                  </span>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* GST Calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            GST Calculator
            <Badge variant="outline" className="ml-auto">
              {(taxRate * 100).toFixed(1)}% GST Rate
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Amount Input */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="amount">Amount *</Label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="amount-type" className="text-xs">
                    {isAmountIncludingGst ? 'Including GST' : 'Excluding GST'}
                  </Label>
                  <Switch
                    id="amount-type"
                    checked={isAmountIncludingGst}
                    onCheckedChange={setIsAmountIncludingGst}
                  />
                </div>
              </div>
              
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00"
                  className="pl-10"
                />
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {isAmountIncludingGst 
                    ? 'GST will be extracted from the total amount'
                    : 'GST will be added to this amount'
                  }
                </AlertDescription>
              </Alert>
            </div>

            {/* GST Breakdown */}
            <div className="space-y-4">
              <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-sm">GST Breakdown</h4>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Net Amount:</span>
                    <span className="font-medium">${formData.netAmount.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GST Amount:</span>
                    <span className={cn(
                      "font-medium",
                      formData.isGstClaimable ? "text-green-600" : "text-red-600"
                    )}>
                      ${formData.gstAmount.toFixed(2)}
                      {!formData.isGstClaimable && <span className="ml-1 text-xs">(Not Claimable)</span>}
                    </span>
                  </div>
                </div>

                <Separator />
                
                <div className="flex justify-between font-semibold">
                  <span>Total Amount:</span>
                  <span>${totalAmount.toFixed(2)}</span>
                </div>

                {formData.isGstClaimable && formData.gstAmount > 0 && (
                  <div className="text-xs text-green-700 bg-green-50 p-2 rounded">
                    <PiggyBank className="h-3 w-3 inline mr-1" />
                    You can claim ${formData.gstAmount.toFixed(2)} GST back from IRD
                  </div>
                )}
              </div>

              {formData.category === 'entertainment' && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Entertainment expenses: Only 50% of GST may be claimable under NZ tax rules
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          {expense ? 'Update Expense' : 'Save Expense'}
        </Button>
      </div>
    </div>
  );
};