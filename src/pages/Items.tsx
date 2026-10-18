import React, { useRef, useState } from 'react';
import { useAppData } from '@/hooks/useAppData';
import { Button } from '@/components/ui/button';
import { Download, FolderOpen, Plus, Trash, Upload } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { itemsApi } from '@/features/items/api/itemsApi';
import { parseItemsCsv } from '@/features/items/model/itemCatalog';

enum FilterType {
  ALL = 'all',
  PRODUCT = 'product',
  SERVICE = 'service',
}

type ActiveFilter = 'all' | 'active' | 'inactive';

const Items = () => {
  const { 
    items, 
    isLoadingItems, 
    createItem, 
    updateItem, 
    deleteItem,
    itemCategories,
    createItemCategory,
    refreshItems,
    businessProfile,
  } = useAppData();
  const { toast } = useToast();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>(FilterType.ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const importRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
    })
    .filter(item => {
      if (activeFilter === 'all') return true;
      return activeFilter === 'active' ? item.isActive !== false : item.isActive === false;
    });

  const runCatalogAction = async (action: () => Promise<unknown>, message: string) => {
    try { await action(); await refreshItems(); setSelectedIds([]); toast({ title: 'Success', description: message }); }
    catch (error) { toast({ title: 'Error', description: error instanceof Error ? error.message : 'Action failed', variant: 'destructive' }); }
  };

  const handleExport = async () => {
    try {
      const url = URL.createObjectURL(await itemsApi.exportCsv());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'items.csv'; anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { toast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Unable to export items', variant: 'destructive' }); }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const rows = parseItemsCsv(await file.text());
      await itemsApi.importItems({ dryRun: true, rows });
      const result = await itemsApi.importItems({ dryRun: false, rows });
      await refreshItems();
      toast({ title: 'Import complete', description: `${result.imported} item${result.imported === 1 ? '' : 's'} imported.` });
    } catch (error) { toast({ title: 'Import failed', description: error instanceof Error ? error.message : 'Invalid CSV', variant: 'destructive' }); }
    finally { event.target.value = ''; }
  };

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
          items.length > 0 ? (<div className="flex flex-wrap gap-2">
            <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImport} />
            <Button variant="outline" onClick={() => importRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Import CSV</Button>
            <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
            <Button onClick={handleOpenDrawer}>
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>) : undefined
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
          <Label htmlFor="activeFilter">Status</Label>
          <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as ActiveFilter)}>
            <SelectTrigger id="activeFilter"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
          </Select>
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
      
      {selectedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <span className="mr-auto text-sm font-medium">{selectedIds.length} selected</span>
        <Button variant="outline" size="sm" onClick={() => runCatalogAction(() => itemsApi.bulk({ action: 'activate', ids: selectedIds }), 'Selected items activated.')}>Activate</Button>
        <Button variant="outline" size="sm" onClick={() => runCatalogAction(() => itemsApi.bulk({ action: 'deactivate', ids: selectedIds }), 'Selected items deactivated.')}>Deactivate</Button>
        <Button variant="destructive" size="sm" onClick={() => runCatalogAction(() => itemsApi.bulk({ action: 'delete', ids: selectedIds }), 'Selected items deleted.')}>Delete</Button>
      </div>}
      <ContentPanel padded={false}>
        <ItemsTable
          items={filteredItems}
          onEdit={handleEditItem}
          onDelete={handleDeleteItem}
          onDuplicate={(id) => runCatalogAction(() => itemsApi.duplicate(id), 'Item duplicated.')}
          onToggleActive={(item) => runCatalogAction(() => itemsApi.update(item.id, { isActive: item.isActive === false }), item.isActive === false ? 'Item activated.' : 'Item deactivated.')}
          currency={businessProfile?.currency || 'NZD'}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      </ContentPanel>

      <ContentPanel>
        <div className="mb-4"><h2 className="font-semibold">Categories</h2><p className="text-sm text-muted-foreground">Rename, activate, or remove unused categories.</p></div>
        <div className="space-y-3">
          {itemCategories.map((category) => (
            <div key={category.id} className="flex items-center gap-3 rounded-lg border p-3">
              <Input aria-label={`Category name ${category.name}`} defaultValue={category.name}
                onBlur={(event) => event.target.value.trim() !== category.name && runCatalogAction(() => itemsApi.updateCategory(category.id, { name: event.target.value }), 'Category renamed.')} />
              <Switch aria-label={`Toggle ${category.name}`} checked={category.isActive !== false}
                onCheckedChange={(checked) => runCatalogAction(() => itemsApi.updateCategory(category.id, { isActive: checked }), checked ? 'Category activated.' : 'Category deactivated.')} />
              <Button aria-label={`Delete ${category.name}`} variant="ghost" size="icon"
                onClick={() => runCatalogAction(() => itemsApi.removeCategory(category.id), 'Category deleted.')}><Trash className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
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
