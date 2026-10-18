import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Item, ItemCategory } from '@/types';
import { useAppData } from '@/hooks/useAppData';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Package, ShoppingCart, DollarSign, ChevronDown, ChevronUp, Tag, FileText } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { cn } from '@/lib/utils';

interface ItemFormProps {
  initialData?: Item | null;
  onSubmit: (data: Item) => void;
  isLoading?: boolean;
  categories?: ItemCategory[];
  onCreateCategory?: (category: Omit<ItemCategory, "id" | "createdAt" | "updatedAt">) => Promise<ItemCategory>;
}

export type ItemFormValues = Item;

const itemFormSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  description: z.string().nullable().optional(),
  type: z.enum(['product', 'service']).default('product'),
  categoryId: z.string().nullable().optional(),
  salePrice: z.number().min(0).nullable().optional(),
  purchasePrice: z.number().min(0).nullable().optional(),
  taxRate: z.number().min(0).max(100).nullable().optional(),
  enableSaleInfo: z.boolean().default(true),
  enablePurchaseInfo: z.boolean().default(false),
  unit: z.string().default('each'),
  isActive: z.boolean().default(true),
});

export function ItemForm({ initialData, onSubmit, isLoading = false, categories, onCreateCategory }: ItemFormProps) {
  const { itemCategories, createItemCategory, units } = useAppData();
  const { toast } = useToast();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [showSaleInfo, setShowSaleInfo] = useState(false);
  const [showPurchaseInfo, setShowPurchaseInfo] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<z.infer<typeof itemFormSchema>>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || null,
      type: initialData?.type || 'product',
      categoryId: initialData?.categoryId || null,
      salePrice: initialData?.salePrice || null,
      purchasePrice: initialData?.purchasePrice || null,
      taxRate: initialData?.taxRate || null,
      enableSaleInfo: initialData?.enableSaleInfo ?? true,
      enablePurchaseInfo: initialData?.enablePurchaseInfo ?? false,
      unit: initialData?.unit || 'each',
      isActive: initialData?.isActive ?? true,
    },
  });

  // Reset form with initial data when it changes
  useEffect(() => {
    if (initialData) {
      const saleInfoEnabled = initialData?.enableSaleInfo ?? true;
      const purchaseInfoEnabled = initialData?.enablePurchaseInfo ?? false;
      
      form.reset({
        name: initialData?.name || '',
        description: initialData?.description || null,
        type: initialData?.type || 'product',
        categoryId: initialData?.categoryId || null,
        salePrice: initialData?.salePrice || null,
        purchasePrice: initialData?.purchasePrice || null,
        taxRate: initialData?.taxRate || null,
        enableSaleInfo: saleInfoEnabled,
        enablePurchaseInfo: purchaseInfoEnabled,
        unit: initialData?.unit || 'each',
        isActive: initialData?.isActive ?? true,
      });
      
      setShowSaleInfo(saleInfoEnabled);
      setShowPurchaseInfo(purchaseInfoEnabled);
    } else {
       form.reset({
        name: '',
        description: null,
        type: 'product',
        categoryId: null,
        salePrice: null,
        purchasePrice: null,
        taxRate: null,
        enableSaleInfo: true,
        enablePurchaseInfo: false,
        unit: 'each',
        isActive: true,
      });
      setShowSaleInfo(true);
      setShowPurchaseInfo(false);
    }
  }, [initialData, form]);

  const effectiveCategories = categories || itemCategories;
  const effectiveCreateCategory = onCreateCategory ? onCreateCategory : createItemCategory;

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      setIsAddingCategory(true);
      const newCategory = await effectiveCreateCategory({ name: newCategoryName });
      form.setValue('categoryId', newCategory.id);
      setNewCategoryName("");
      toast({
        title: "Success",
        description: `Category "${newCategory.name}" created successfully`,
      });
    } catch (error) {
      console.error("Error creating category:", error);
      toast({
        title: "Error",
        description: "Failed to create category",
        variant: "destructive",
      });
    } finally {
      setIsAddingCategory(false);
    }
  };

  // Manual validation for fields dependent on toggles (Sale/Purchase Info)
  const validateConditionalFields = () => {
    if (showSaleInfo && (form.getValues('salePrice') === null || form.getValues('salePrice') === undefined)) {
      form.setError('salePrice', { type: 'manual', message: 'Sale price is required when Sale Information is enabled' });
      return false;
    } else {
      form.clearErrors('salePrice');
    }

    if (showPurchaseInfo && (form.getValues('purchasePrice') === null || form.getValues('purchasePrice') === undefined)) {
       form.setError('purchasePrice', { type: 'manual', message: 'Purchase price is required when Purchase Information is enabled' });
       return false;
    } else {
      form.clearErrors('purchasePrice');
    }

    return true;
  };

  const handleSubmit = (values: z.infer<typeof itemFormSchema>) => {
     if (!validateConditionalFields()) {
       return;
     }

    // Map form values back to Item type
    // For new items (no initialData.id), don't include id/createdAt/updatedAt
    // For existing items, include them from initialData
    const baseItemData = {
      name: values.name,
      type: values.type,
      description: values.description || null,
      categoryId: values.categoryId || null,
      salePrice: showSaleInfo ? values.salePrice || null : null,
      purchasePrice: showPurchaseInfo ? values.purchasePrice || null : null,
      taxRate: values.taxRate || null,
      enableSaleInfo: showSaleInfo,
      enablePurchaseInfo: showPurchaseInfo,
      unit: values.unit,
      isActive: values.isActive,
    };

    // Only include id, createdAt, updatedAt if we have an existing item
    const itemData: Item = initialData?.id
      ? {
          ...baseItemData,
          id: initialData.id,
          createdAt: initialData.createdAt,
          updatedAt: initialData.updatedAt,
        }
      : {
          ...baseItemData,
          id: '', // Will be ignored by createItem service
        } as Item;

    onSubmit(itemData);
  };

  // Handle input focus with smooth scroll
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement;
    activeInputRef.current = target;
    const inputRect = target.getBoundingClientRect();
    const drawerContent = document.querySelector('.drawer-content');
    
    if (drawerContent) {
      const drawerRect = drawerContent.getBoundingClientRect();
      const scrollTop = drawerContent.scrollTop;
      const inputTop = inputRect.top - drawerRect.top + scrollTop;
      
      // Add some padding to ensure the input is not at the very top
      const targetScroll = inputTop - 100;
      
      drawerContent.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const inputs = formRef.current?.querySelectorAll('input, textarea, select');
      if (inputs) {
        const currentIndex = Array.from(inputs).indexOf(e.target as HTMLElement);
        const nextInput = inputs[currentIndex + 1] as HTMLElement;
        if (nextInput) {
          nextInput.focus();
        }
      }
    }
  };

  return (
    <Form {...form}>
      <form 
        ref={formRef}
        onSubmit={form.handleSubmit(handleSubmit)} 
        className="space-y-6" 
        id="item-form"
      >
        {/* Basic Item Information Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">Basic Information</h3>
          </div>
          
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">Item Name *</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter item name" 
                    {...field} 
                    onFocus={handleInputFocus}
                    onKeyDown={handleKeyDown}
                    className="h-11 focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    Type
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex space-x-4 pt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="product" id="product" />
                        <Label htmlFor="product" className="text-sm">Product</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="service" id="service" />
                        <Label htmlFor="service" className="text-sm">Service</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Unit</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(units || []).map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">Category</FormLabel>
                <div className="flex space-x-2">
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || ''}
                  >
                    <FormControl className="flex-1">
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(effectiveCategories || []).filter((category) => category.isActive !== false).map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" size="icon" disabled={isAddingCategory || isLoading} className="h-11">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-2">
                        <Label htmlFor="newCategory">New Category</Label>
                        <div className="flex space-x-2">
                          <Input
                            id="newCategory"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="Category name"
                            disabled={isAddingCategory || isLoading}
                          />
                          <Button
                            type="button"
                            onClick={handleCreateCategory}
                            disabled={isAddingCategory || !newCategoryName.trim() || isLoading}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Description
                </FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Describe the item (optional)" 
                    rows={3} 
                    {...field} 
                    value={field.value || ''} 
                    onFocus={handleInputFocus}
                    onKeyDown={handleKeyDown}
                    className="resize-none focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <FormLabel>Active</FormLabel>
                  <p className="text-sm text-muted-foreground">Available for new transactions.</p>
                </div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )}
          />
        </div>

        {/* Sale Information Section - Collapsible */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              const newValue = !showSaleInfo;
              setShowSaleInfo(newValue);
              form.setValue('enableSaleInfo', newValue);
            }}
            className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Sale Information</span>
              <span className="text-xs text-muted-foreground">(For selling this item)</span>
            </div>
            {showSaleInfo ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          
          <div className={cn(
            "space-y-4 overflow-hidden transition-all duration-300 ease-in-out",
            showSaleInfo ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
          )}>
            <FormField
              control={form.control}
              name="salePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Sale Price *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        value={field.value === null || field.value === undefined ? '' : field.value}
                        onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                        onFocus={handleInputFocus}
                        onKeyDown={handleKeyDown}
                        className="h-11 pl-10 focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200"
                      />
                    </div>
                  </FormControl>
                  {form.formState.errors.salePrice && (
                    <FormMessage>{form.formState.errors.salePrice.message}</FormMessage>
                  )}
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="taxRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Tax Rate (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="15.00"
                      {...field}
                      value={field.value === null || field.value === undefined ? '' : field.value}
                      onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                      onFocus={handleInputFocus}
                      onKeyDown={handleKeyDown}
                      className="h-11 focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Purchase Information Section - Collapsible */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              const newValue = !showPurchaseInfo;
              setShowPurchaseInfo(newValue);
              form.setValue('enablePurchaseInfo', newValue);
            }}
            className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Purchase Information</span>
              <span className="text-xs text-muted-foreground">(For buying this item)</span>
            </div>
            {showPurchaseInfo ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          
          <div className={cn(
            "space-y-4 overflow-hidden transition-all duration-300 ease-in-out",
            showPurchaseInfo ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
          )}>
            <FormField
              control={form.control}
              name="purchasePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Purchase Price *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        value={field.value === null || field.value === undefined ? '' : field.value}
                        onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                        onFocus={handleInputFocus}
                        onKeyDown={handleKeyDown}
                        className="h-11 pl-10 focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-200"
                      />
                    </div>
                  </FormControl>
                  {form.formState.errors.purchasePrice && (
                    <FormMessage>{form.formState.errors.purchasePrice.message}</FormMessage>
                  )}
                </FormItem>
              )}
            />
          </div>
        </div>

      </form>
    </Form>
  );
}
