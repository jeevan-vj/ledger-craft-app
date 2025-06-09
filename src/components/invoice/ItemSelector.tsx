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
import { Drawer, DrawerContent, DrawerTrigger, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { PlusCircle, SearchIcon, Package2, Sparkles, Grid, List, Filter, X } from 'lucide-react';
import { Item } from '@/types';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppContext } from '@/context/AppContext';
import { itemService } from '@/services/supabaseService';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/utils/invoiceUtils';
import { motion, AnimatePresence } from 'framer-motion';

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
  const { itemCategories } = useAppContext();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<'all' | 'product' | 'service'>('all');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

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
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchItems();
  }, [refetch]);

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.category?.name && item.category.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const matchesType = selectedType === 'all' || item.type === selectedType;
    
    return matchesSearch && matchesCategory && matchesType;
  });

  const handleItemSelect = (item: Item) => {
    onItemSelect(item);
    setOpen(false);
    setSearchTerm('');
    setActiveFilters([]);
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
      setActiveFilters([]);
    }
  };

  const toggleFilter = (filter: string) => {
    setActiveFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  const clearFilters = () => {
    setActiveFilters([]);
    setSelectedCategory('all');
    setSelectedType('all');
  };

  const renderItemCard = (item: Item) => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative group cursor-pointer rounded-lg border p-3 hover:border-primary transition-all duration-200"
      onClick={() => handleItemSelect(item)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {item.type === 'product' ? (
            <Package2 className="h-5 w-5 text-primary" />
          ) : (
            <Sparkles className="h-5 w-5 text-primary" />
          )}
          <div>
            <h3 className="font-medium text-sm">{item.name}</h3>
            {item.category?.name && (
              <Badge variant="secondary" className="text-xs mt-1">
                {item.category.name}
              </Badge>
            )}
          </div>
        </div>
        {item.enableSaleInfo && item.salePrice !== null && (
          <div className="text-sm font-medium">
            {formatCurrency(item.salePrice, 'USD')}
          </div>
        )}
      </div>
      {item.description && (
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
          {item.description}
        </p>
      )}
      <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
    </motion.div>
  );

  const renderItemList = (item: Item) => (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex items-center justify-between p-2 hover:bg-accent rounded-md cursor-pointer"
      onClick={() => handleItemSelect(item)}
    >
      <div className="flex items-center gap-3">
        {item.type === 'product' ? (
          <Package2 className="h-4 w-4 text-primary" />
        ) : (
          <Sparkles className="h-4 w-4 text-primary" />
        )}
        <div>
          <div className="font-medium">{item.name}</div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            {item.category?.name && (
              <Badge variant="secondary" className="text-xs">
                {item.category.name}
              </Badge>
            )}
            {item.enableSaleInfo && item.salePrice !== null && (
              <span>{formatCurrency(item.salePrice, 'USD')}</span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );

  const content = (
    <>
      <DialogHeader className="p-4">
        <DialogTitle>Select an Item</DialogTitle>
        <DialogDescription>
          Search for an existing item or create a new one.
        </DialogDescription>
      </DialogHeader>
      
      <div className="p-4 space-y-4">
        {/* Search and View Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          >
            {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
          </Button>
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedType('all')}
          >
            All
          </Button>
          <Button
            variant={selectedType === 'product' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedType('product')}
            className="flex items-center gap-1"
          >
            <Package2 className="h-3 w-3" />
            Products
          </Button>
          <Button
            variant={selectedType === 'service' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedType('service')}
            className="flex items-center gap-1"
          >
            <Sparkles className="h-3 w-3" />
            Services
          </Button>
        </div>

        {/* Category Filter */}
        <ScrollArea className="h-12">
          <div className="flex gap-2 pb-2">
            <Button
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('all')}
            >
              All Categories
            </Button>
            {itemCategories.map((category) => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </ScrollArea>

        {/* Active Filters */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-wrap gap-2">
              {activeFilters.map((filter) => (
                <Badge
                  key={filter}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {filter}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFilter(filter);
                    }}
                  />
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-5 px-2"
              >
                Clear all
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Items Display */}
      <ScrollArea className="h-[400px] px-4">
        <AnimatePresence mode="wait">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-3">
              {filteredItems.map((item) => renderItemCard(item))}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredItems.map((item) => renderItemList(item))}
            </div>
          )}
        </AnimatePresence>
      </ScrollArea>

      {/* Create New Item Button */}
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
    </>
  );

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
        <DrawerContent className="h-[95%]">
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          size="default"
          className={`${buttonClassName} bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all duration-200 hover:scale-[1.02]`}
          disabled={isLoading}
        >
          {iconOnly ? (
            <Package2 className="h-4 w-4" />
          ) : (
            <div className="flex items-center gap-2">
              <Package2 className="h-4 w-4" />
              <span>Select Item</span>
            </div>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0 sm:max-w-[700px]">
        {content}
      </DialogContent>
    </Dialog>
  );
};

export default ItemSelector;
