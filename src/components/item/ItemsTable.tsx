
import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Item } from '@/types';
import { formatCurrency } from '@/utils/invoiceUtils';
import { Copy, Edit, MoreHorizontal, Package2, Power, Sparkles, Trash } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ItemFormValues } from './ItemForm';
import ItemDrawer from './ItemDrawer';

interface ItemsTableProps {
  items: Item[];
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleActive: (item: Item) => void;
  currency?: string;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

const ItemsTable: React.FC<ItemsTableProps> = ({
  items,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleActive,
  currency = 'NZD',
  selectedIds = [],
  onSelectionChange,
}) => {
  const isMobile = useIsMobile();
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);
  const toggleSelected = (id: string, checked: boolean) => onSelectionChange?.(
    checked ? [...selectedIds, id] : selectedIds.filter((selected) => selected !== id),
  );

  const handleDelete = (item: Item) => {
    setItemToDelete(item);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      onDelete(itemToDelete.id);
      setItemToDelete(null);
    }
  };

  if (isMobile) {
    return (
      <div className="space-y-4">
        {items.map((item) => (
          <div 
            key={item.id} 
            className="bg-card rounded-md border p-4 shadow-sm"
            onClick={() => onEdit(item)}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <Checkbox className="mr-3" aria-label={`Select ${item.name}`} checked={selectedIds.includes(item.id)}
                  onCheckedChange={(checked) => toggleSelected(item.id, checked === true)} onClick={(event) => event.stopPropagation()} />
                {item.type === 'product' ? (
                  <Package2 className="h-4 w-4 mr-2 text-muted-foreground" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2 text-muted-foreground" />
                )}
                <h3 className="font-medium">{item.name}</h3>
                <Badge className="ml-2" variant={item.isActive === false ? 'secondary' : 'outline'}>
                  {item.isActive === false ? 'Inactive' : 'Active'}
                </Badge>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    onEdit(item);
                  }}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(item.id); }}>
                    <Copy className="mr-2 h-4 w-4" />Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleActive(item); }}>
                    <Power className="mr-2 h-4 w-4" />{item.isActive === false ? 'Activate' : 'Deactivate'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item);
                    }}
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {item.category?.name || 'Uncategorized'}
            </div>
            {item.enableSaleInfo && item.salePrice !== null && item.salePrice !== undefined && (
              <div className="text-sm mt-2">
                Price: {formatCurrency(item.salePrice, currency)}
              </div>
            )}
            {item.description && (
              <div className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {item.description}
              </div>
            )}
          </div>
        ))}
        <AlertDialog open={!!itemToDelete} onOpenChange={(isOpen) => !isOpen && setItemToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Item</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"><Checkbox aria-label="Select all items" checked={items.length > 0 && items.every((item) => selectedIds.includes(item.id))}
              onCheckedChange={(checked) => onSelectionChange?.(checked ? items.map((item) => item.id) : [])} /></TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell><Checkbox aria-label={`Select ${item.name}`} checked={selectedIds.includes(item.id)}
                onCheckedChange={(checked) => toggleSelected(item.id, checked === true)} /></TableCell>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>
                <div className="flex items-center">
                  {item.type === 'product' ? (
                    <>
                      <Package2 className="h-4 w-4 mr-1" />
                      <span>Product</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-1" />
                      <span>Service</span>
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell>{item.category?.name || 'Uncategorized'}</TableCell>
              <TableCell>
                {item.enableSaleInfo && item.salePrice !== null && item.salePrice !== undefined
                  ? formatCurrency(item.salePrice, currency)
                  : '-'}
              </TableCell>
              <TableCell>{item.unit}</TableCell>
              <TableCell><Badge variant={item.isActive === false ? 'secondary' : 'outline'}>{item.isActive === false ? 'Inactive' : 'Active'}</Badge></TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(item)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(item.id)}>
                      <Copy className="mr-2 h-4 w-4" />Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleActive(item)}>
                      <Power className="mr-2 h-4 w-4" />{item.isActive === false ? 'Activate' : 'Deactivate'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(item)}
                    >
                      <Trash className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={!!itemToDelete} onOpenChange={(isOpen) => !isOpen && setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ItemsTable;
