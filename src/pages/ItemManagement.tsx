import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { ItemForm } from '@/components/item/ItemForm';
import { Item, ItemCategory } from '@/types';

const ItemManagement = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items, itemCategories, createItem, updateItem, createItemCategory } = useAppContext();
  const [item, setItem] = useState<Item | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (id) {
      const foundItem = items.find(i => i.id === id);
      if (foundItem) {
        setItem(foundItem);
      }
    }
    setIsLoading(false);
  }, [id, items]);

  const handleSubmit = async (values: Item) => {
    try {
      if (id) {
        await updateItem(id, values);
        toast({
          title: "Success",
          description: "Item updated successfully",
        });
      } else {
        await createItem(values);
        toast({
          title: "Success",
          description: "Item created successfully",
        });
      }
      navigate('/items');
    } catch (error) {
      console.error('Error saving item:', error);
      toast({
        title: "Error",
        description: "Failed to save item. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateCategory = async (category: Omit<ItemCategory, "id" | "createdAt" | "updatedAt">) => {
    return await createItemCategory(category);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/items')}
          className="hover:bg-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">
          {id ? 'Edit Item' : 'New Item'}
        </h1>
      </div>

      <div className="max-w-2xl">
        <ItemForm
          initialData={item}
          onSubmit={handleSubmit}
          categories={itemCategories}
          onCreateCategory={handleCreateCategory}
        />
      </div>
    </div>
  );
};

export default ItemManagement; 