import React, { useState, useEffect } from 'react';
import { 
  Command, 
  CommandInput, 
  CommandList, 
  CommandEmpty, 
  CommandGroup, 
  CommandItem,
  CommandSeparator
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { PlusCircle, SearchIcon, Package2, Sparkles } from 'lucide-react';
import { Item } from '@/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppData } from '@/hooks/useAppData';
import { itemService } from '@/services/supabaseService';
import { DrawerFormLayout } from '@/components/ui/DrawerFormLayout';
import { formatCurrency } from '@/utils/invoiceUtils';
import { saleSelectableItems } from '@/features/items/model/itemCatalog';

interface ItemSelectorProps {
  onItemSelect: (item: Item) => void;
  onCreateNewItem?: () => void;
  buttonClassName?: string;
  iconOnly?: boolean;
  refetch: () => void;
}

const ItemSelector: React.FC<ItemSelectorProps> = ({ 
  onItemSelect,
  onCreateNewItem,
  buttonClassName = "",
  iconOnly = false,
  refetch
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const { itemCategories, businessProfile } = useAppData();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchItems = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedItems = await itemService.getItems();
        setItems(fetchedItems);
      } catch (err) {
        console.error("Error fetching items:", err);
        setError("Failed to load items.");
        setItems([]); // Clear items on error
      } finally {
        setIsLoading(false);
      }
    };

    fetchItems();
  }, [refetch]); // Refetch when the refetch function changes

  const filteredItems = saleSelectableItems(items).filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.category?.name && item.category.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleItemSelect = (item: Item) => {
    onItemSelect(item);
    setOpen(false);
    setSearchTerm('');
  };

  const handleCreateNewItem = () => {
    if (onCreateNewItem) {
      onCreateNewItem();
      setOpen(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchTerm('');
    }
  };
  
  // Group items by type
  const products = filteredItems.filter(item => item.type === 'product');
  const services = filteredItems.filter(item => item.type === 'service');

  const desktopContent = (
    <>
      <div className="p-4">
        <div className="mb-2">
          <div className="text-lg font-semibold">Select an Item</div>
          <div className="text-sm text-muted-foreground">
            Search for an existing item or create a new one.
          </div>
        </div>
      </div>
      <Command className="rounded-lg border shadow-md">
        <div className="flex items-center border-b px-3">
          <SearchIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <CommandInput
            autoFocus
            placeholder="Search items..."
            className="flex h-11 w-full rounded-md bg-transparent py-3 outline-none placeholder:text-muted-foreground"
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
        </div>
        <CommandList className="max-h-[300px] overflow-auto">
          <CommandEmpty>No items found.</CommandEmpty>
          {products.length > 0 && (
            <CommandGroup heading="Products">
              {products.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`product-${item.id}`}
                  onSelect={() => handleItemSelect(item)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center">
                    <Package2 className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-muted-foreground flex gap-3">
                        <span>{item.salePrice != null ? formatCurrency(item.salePrice, businessProfile?.currency || 'NZD') : ''}</span>
                        {item.category?.name && <span>{item.category.name}</span>}
                      </div>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {services.length > 0 && (
            <CommandGroup heading="Services">
              {services.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`service-${item.id}`}
                  onSelect={() => handleItemSelect(item)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center">
                    <Sparkles className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-muted-foreground flex gap-3">
                        <span>{item.salePrice != null ? formatCurrency(item.salePrice, businessProfile?.currency || 'NZD') : ''}</span>
                        {item.category?.name && <span>{item.category.name}</span>}
                      </div>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        {onCreateNewItem && (
          <div className="p-4 border-t">
            <Button
              variant="ghost"
              onClick={handleCreateNewItem}
              className="w-full justify-start text-primary"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Create New Item
            </Button>
          </div>
        )}
      </Command>
    </>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={buttonClassName}
            disabled={isLoading}
          >
            {iconOnly ? (
              <Package2 className="h-4 w-4" />
            ) : (
              "Select Item"
            )}
          </Button>
        </DrawerTrigger>
        <DrawerContent className="drawer-content">
          <div className="flex flex-col h-full max-h-[92vh]">
            <div className="shrink-0 sticky top-0 bg-background z-10 p-4">
              <div className="text-lg font-semibold">Select an Item</div>
              <div className="text-sm text-muted-foreground">
                Search for an existing item or create a new one.
              </div>
            </div>
            <div className="flex-1 px-4 pb-4">
              <Command 
                className="rounded-lg border shadow-md h-full"
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                <div className="flex items-center border-b px-3">
                  <SearchIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  <CommandInput
                    autoFocus
                    placeholder="Search items..."
                    className="flex h-11 w-full rounded-md bg-transparent py-3 outline-none placeholder:text-muted-foreground"
                    value={searchTerm}
                    onValueChange={setSearchTerm}
                  />
                </div>
                <CommandList 
                  className="flex-1 overflow-auto"
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                >
                  <CommandEmpty>No items found.</CommandEmpty>
                  {products.length > 0 && (
                    <CommandGroup heading="Products">
                      {products.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={`product-${item.id}`}
                          onSelect={() => handleItemSelect(item)}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center">
                            <Package2 className="mr-2 h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-sm text-muted-foreground flex gap-3">
                                <span>{item.salePrice != null ? formatCurrency(item.salePrice, businessProfile?.currency || 'NZD') : ''}</span>
                                {item.category?.name && <span>{item.category.name}</span>}
                              </div>
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {services.length > 0 && (
                    <CommandGroup heading="Services">
                      {services.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={`service-${item.id}`}
                          onSelect={() => handleItemSelect(item)}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center">
                            <Sparkles className="mr-2 h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-sm text-muted-foreground flex gap-3">
                                <span>{item.salePrice != null ? formatCurrency(item.salePrice, businessProfile?.currency || 'NZD') : ''}</span>
                                {item.category?.name && <span>{item.category.name}</span>}
                              </div>
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
                {onCreateNewItem && (
                  <div className="p-4 border-t">
                    <Button
                      variant="ghost"
                      onClick={handleCreateNewItem}
                      className="w-full justify-start text-primary"
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Create New Item
                    </Button>
                  </div>
                )}
              </Command>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="default"
          className={buttonClassName}
          disabled={isLoading}
        >
          {iconOnly ? (
            <Package2 className="h-4 w-4" />
          ) : (
            "Select Item"
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className={`p-0 ${isMobile ? 'w-[95%]' : 'sm:max-w-[700px]'}`}>
        {desktopContent}
      </DialogContent>
    </Dialog>
  );
};

export default ItemSelector;
