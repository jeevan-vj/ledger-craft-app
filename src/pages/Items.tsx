import React, { useState, useEffect } from 'react';
import { useAppData } from '@/hooks/useAppData';
import { Button } from '@/components/ui/button';
import { Plus, FolderOpen } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ContentPanel } from '@/components/ui/ContentPanel';
import ItemsTable from '@/components/item/ItemsTable';
import ItemDrawer from '@/components/item/ItemDrawer';
import { Item, ItemCategory } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

enum FilterType {
  ALL = 'all',
  PRODUCT = 'product',
  SERVICE = 'service',
}

const Items = () => {
  const { 
    items, 
    isLoadingItems, 
    createItem, 
    updateItem, 
    deleteItem,
    itemCategories,
    createItemCategory
  } = useAppData();
  const { toast } = useToast();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>(FilterType.ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filteredItems = items
    .filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description?.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .filter(item => {
      if (filterType === FilterType.ALL) return true;
      return item.type === filterType.toLowerCase();
    })
    .filter(item => {
      if (categoryFilter === 'all') return true;
      return item.categoryId === categoryFilter;
    });

  const handleOpenDrawer = () => {
    setSelectedItem(null);
    setIsDrawerOpen(true);
  };

  const handleEditItem = (item: Item) => {
    setSelectedItem(item);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedItem(null);
  };

  const handleCreateItem = async (itemData: Omit<Item, "id" | "createdAt" | "updatedAt" | "category">) => {
    try {
      await createItem(itemData);
      setIsDrawerOpen(false);
      toast({
        title: "Success",
        description: "Item created successfully",
      });
    } catch (error) {
      console.error("Failed to create item:", error);
      toast({
        title: "Error",
        description: "Failed to create item",
        variant: "destructive",
      });
    }
  };

  const handleUpdateItem = async (item: Item) => {
    try {
      const { id, ...itemData } = item;
      await updateItem(id, itemData);
      setIsDrawerOpen(false);
      toast({
        title: "Success",
        description: "Item updated successfully",
      });
    } catch (error) {
      console.error("Failed to update item:", error);
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteItem(id);
      toast({
        title: "Success",
        description: "Item deleted successfully",
      });
    } catch (error) {
      console.error("Failed to delete item:", error);
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      });
    }
  };

  const handleSubmitItem = async (item: Item): Promise<void> => {
    if (item.id) {
      await handleUpdateItem(item);
    } else {
      // Remove id for creation since it will be generated on the server
      const { id, createdAt, updatedAt, ...itemData } = item;
      await handleCreateItem(itemData);
    }
  };

  const handleCreateCategory = async (name: string) => {
    return await createItemCategory({ name });
  };

  if (isLoadingItems) {
    return (
      <div className="space-y-6">
        <PageHeader title="Items" />
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
        title="Items"
        actions={
          items.length > 0 ? (
            <Button onClick={handleOpenDrawer}>
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          ) : undefined
        }
      />

      {items.length === 0 && (
        <EmptyState
          variant="panel"
          title="Here's how to get started"
          description="Save products and services you invoice often so you can add them in one tap."
          actions={[
            {
              icon: FolderOpen,
              title: 'Add an item',
              subtitle: 'Name, price, and tax for products or services.',
              onClick: handleOpenDrawer,
            },
          ]}
        />
      )}

      {items.length > 0 && (
      <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or description"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filterType">Type</Label>
          <Select 
            value={filterType} 
            onValueChange={(value) => setFilterType(value as FilterType)}
          >
            <SelectTrigger id="filterType">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FilterType.ALL}>All Items</SelectItem>
              <SelectItem value={FilterType.PRODUCT}>Products</SelectItem>
              <SelectItem value={FilterType.SERVICE}>Services</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="categoryFilter">Category</Label>
          <Select 
            value={categoryFilter} 
            onValueChange={(value) => setCategoryFilter(value)}
          >
            <SelectTrigger id="categoryFilter">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {itemCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <ContentPanel padded={false}>
        <ItemsTable
          items={filteredItems}
          onEdit={handleEditItem}
          onDelete={handleDeleteItem}
        />
      </ContentPanel>
      </>
      )}

      <ItemDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        item={selectedItem}
        onSave={handleSubmitItem}
        categories={itemCategories}
        isLoading={isLoadingItems}
        onCreateCategory={handleCreateCategory}
      />
    </div>
  );
};

export default Items;
