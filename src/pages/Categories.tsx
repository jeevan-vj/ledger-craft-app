import React, { useState, useEffect } from 'react';
import { useAppData } from '@/hooks/useAppData';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import CategoriesTable from '@/components/category/CategoriesTable';
import CategoryDrawer from '@/components/category/CategoryDrawer';
import { ItemCategory } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/PageHeader';

const Categories = () => {
  const { 
    itemCategories, 
    isLoadingItemCategories, 
    createItemCategory, 
    updateItemCategory, 
    deleteItemCategory, 
    fetchItemCategories 
  } = useAppData();
  const { toast } = useToast();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // itemCategories are already fetched by AppProvider on mount
    // No need to call fetchItemCategories here unless you need to refresh
    // fetchItemCategories(); 
  }, []);

  const handleOpenDrawer = () => {
    setSelectedCategory(null);
    setIsDrawerOpen(true);
  };

  const handleEditCategory = (category: ItemCategory) => {
    setSelectedCategory(category);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedCategory(null);
  };

  const handleSaveCategory = async (categoryData: ItemCategory) => {
    try {
      setIsSaving(true);
      if (categoryData.id) {
        // Update existing category
        await updateItemCategory(categoryData.id, categoryData);
        toast({
          title: "Success",
          description: "Category updated successfully",
        });
      } else {
        // Create new category
        // Omit id for creation as it will be generated
        const { id, ...newCategoryData } = categoryData;
        await createItemCategory(newCategoryData);
        toast({
          title: "Success",
          description: "Category created successfully",
        });
      }
      handleCloseDrawer();
    } catch (error) {
      console.error("Failed to save category:", error);
      toast({
        title: "Error",
        description: `Failed to save category: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteItemCategory(id);
      toast({
        title: "Success",
        description: "Category deleted successfully",
      });
    } catch (error) {
      console.error("Failed to delete category:", error);
      toast({
        title: "Error",
        description: `Failed to delete category: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    }
  };

  if (isLoadingItemCategories) {
    return (
      <div className="space-y-6">
        <PageHeader title="Categories" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="w-full h-16" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        actions={
          <Button onClick={handleOpenDrawer}>
            <Plus className="w-4 h-4 mr-2" />
            Add Category
          </Button>
        }
      />

      <CategoriesTable
        categories={itemCategories}
        onEdit={handleEditCategory}
        onDelete={handleDeleteCategory}
      />

      <CategoryDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        category={selectedCategory}
        onSave={handleSaveCategory}
        isLoading={isSaving}
      />
    </div>
  );
};

export default Categories; 