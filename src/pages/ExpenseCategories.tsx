import React, { useState } from 'react';
import { useAppData } from '@/hooks/useAppData';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import ExpenseCategoryTable from '@/components/expense/ExpenseCategoryTable';
import ExpenseCategoryFormDrawer from '@/components/expense/ExpenseCategoryFormDrawer';
import { ExpenseCategory } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ExpenseCategoryFormValues } from '@/components/expense/ExpenseCategoryFormDrawer';
import { PageHeader } from '@/components/layout/PageHeader';

const ExpenseCategories = () => {
  const { 
    expenseCategories, 
    isLoadingExpenseCategories, 
    createExpenseCategory, 
    updateExpenseCategory, 
    deleteExpenseCategory 
  } = useAppData();
  const { toast } = useToast();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenDrawer = () => {
    setSelectedCategory(null);
    setIsDrawerOpen(true);
  };

  const handleEditCategory = (category: ExpenseCategory) => {
    setSelectedCategory(category);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedCategory(null);
  };

  const handleSaveCategory = async (categoryData: ExpenseCategoryFormValues) => {
    try {
      setIsSaving(true);
      
      const mappedData = {
        name: categoryData.name,
        description: categoryData.description || null,
        color: categoryData.color || null,
      };

      if (selectedCategory) {
        // Update existing category
        await updateExpenseCategory(selectedCategory.id, mappedData);
        toast({
          title: "Success",
          description: "Expense category updated successfully",
        });
      } else {
        // Create new category
        await createExpenseCategory(mappedData);
        toast({
          title: "Success",
          description: "Expense category created successfully",
        });
      }
      handleCloseDrawer();
    } catch (error) {
      console.error("Failed to save expense category:", error);
      toast({
        title: "Error",
        description: `Failed to save expense category: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await deleteExpenseCategory(id);
      toast({
        title: "Success",
        description: "Expense category deleted successfully",
      });
    } catch (error) {
      console.error("Failed to delete expense category:", error);
      toast({
        title: "Error",
        description: `Failed to delete expense category: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    }
  };

  if (isLoadingExpenseCategories) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-80 mt-2" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense Categories"
        description="Organize your expenses with custom categories for better tracking and reporting."
        actions={
          <Button onClick={handleOpenDrawer}>
            <Plus className="mr-2 h-4 w-4" />
            New Category
          </Button>
        }
      />

      {expenseCategories.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground">
            <div className="text-lg font-medium mb-2">No expense categories yet</div>
            <div className="text-sm">Create categories to organize your expenses better.</div>
          </div>
          <Button className="mt-4" onClick={handleOpenDrawer}>
            <Plus className="mr-2 h-4 w-4" />
            Create Category
          </Button>
        </div>
      ) : (
        <ExpenseCategoryTable
          categories={expenseCategories}
          onEdit={handleEditCategory}
          onDelete={handleDeleteCategory}
        />
      )}

      <ExpenseCategoryFormDrawer
        open={isDrawerOpen}
        onOpenChange={handleCloseDrawer}
        initialValues={selectedCategory}
        onSubmit={handleSaveCategory}
      />
    </div>
  );
};

export default ExpenseCategories;