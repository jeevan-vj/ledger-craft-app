import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ItemCategory } from '@/types';

interface CategoryFormProps {
  initialData?: ItemCategory | null;
  onSubmit: (data: ItemCategory) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function CategoryForm({ initialData, onSubmit, onCancel, isLoading = false }: CategoryFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<ItemCategory>>({
    name: initialData?.name || '',
    color: initialData?.color || '#2196f3',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = <Key extends keyof ItemCategory,>(field: Key, value: ItemCategory[Key]) => {
    setFormData({
      ...formData,
      [field]: value
    });
  };

  const validateForm = () => {
    if (!formData.name) {
      toast({
        title: 'Error',
        description: 'Name is required',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      setIsSubmitting(true);
      const categoryData: ItemCategory = {
        id: initialData?.id || '',
        name: formData.name!,
        color: formData.color || '#2196f3',
        createdAt: initialData?.createdAt,
        updatedAt: initialData?.updatedAt,
      };
      onSubmit(categoryData);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save category',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" id="category-form">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name*</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Category name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="color">Color</Label>
          <Input
            id="color"
            type="color"
            value={formData.color}
            onChange={(e) => handleChange('color', e.target.value)}
            className="w-16 h-10 p-0 border-none bg-transparent"
          />
        </div>
      </div>
    </form>
  );
} 