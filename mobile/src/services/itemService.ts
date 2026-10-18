import { itemsApi, itemsApiEnabled } from '@/features/items/api/itemsApi';
import { supabase } from './supabaseClient';

export interface ItemCategory {
  id: string;
  name: string;
  color?: string;
  isActive?: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Item {
  id: string;
  name: string;
  description?: string | null;
  type: 'product' | 'service';
  categoryId?: string | null;
  category?: ItemCategory | null;
  salePrice?: number | null;
  purchasePrice?: number | null;
  taxRate?: number | null;
  enableSaleInfo: boolean;
  enablePurchaseInfo: boolean;
  unit: string;
  isActive?: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

function fromRow(item: {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  category_id?: string | null;
  sale_price?: number | null;
  purchase_price?: number | null;
  tax_rate?: number | null;
  enable_sale_info?: boolean;
  enable_purchase_info?: boolean;
  unit?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}): Item {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    type: item.type === 'service' ? 'service' : 'product',
    categoryId: item.category_id,
    category: undefined,
    salePrice: item.sale_price,
    purchasePrice: item.purchase_price,
    taxRate: item.tax_rate,
    enableSaleInfo: item.enable_sale_info !== false,
    enablePurchaseInfo: item.enable_purchase_info || false,
    unit: item.unit || 'unit',
    isActive: true,
    userId: item.user_id,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export class ItemService {
  async fetchItems(): Promise<Item[]> {
    try {
      if (itemsApiEnabled()) {
        return (await itemsApi.list()).items;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []).map(fromRow);
    } catch (error) {
      console.error('Error fetching items:', error);
      throw error;
    }
  }

  async getItems(type?: 'product' | 'service'): Promise<Item[]> {
    const items = await this.fetchItems();
    return type ? items.filter((item) => item.type === type) : items;
  }

  async fetchItemById(id: string): Promise<Item> {
    try {
      if (itemsApiEnabled()) {
        const item = (await itemsApi.list()).items.find((entry) => entry.id === id);
        if (!item) throw new Error('Item not found');
        return item;
      }

      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Item not found');
      return fromRow(data);
    } catch (error) {
      console.error('Error fetching item:', error);
      throw error;
    }
  }

  async createItem(itemData: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'category'>): Promise<Item> {
    try {
      if (itemsApiEnabled()) {
        return itemsApi.create(itemData);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('items')
        .insert({
          name: itemData.name,
          description: itemData.description || null,
          type: itemData.type,
          category_id: itemData.categoryId || null,
          sale_price: itemData.salePrice || null,
          purchase_price: itemData.purchasePrice || null,
          tax_rate: itemData.taxRate || null,
          enable_sale_info: itemData.enableSaleInfo !== false,
          enable_purchase_info: itemData.enablePurchaseInfo || false,
          unit: itemData.unit || 'unit',
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return await this.fetchItemById(data.id);
    } catch (error) {
      console.error('Error creating item:', error);
      throw error;
    }
  }

  async updateItem(id: string, itemData: Partial<Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'category'>>): Promise<Item> {
    try {
      if (itemsApiEnabled()) {
        return itemsApi.update(id, itemData);
      }

      const dbItemData: Record<string, unknown> = {};
      if (itemData.name !== undefined) dbItemData.name = itemData.name;
      if (itemData.description !== undefined) dbItemData.description = itemData.description || null;
      if (itemData.type !== undefined) dbItemData.type = itemData.type;
      if (itemData.categoryId !== undefined) dbItemData.category_id = itemData.categoryId || null;
      if (itemData.salePrice !== undefined) dbItemData.sale_price = itemData.salePrice || null;
      if (itemData.purchasePrice !== undefined) dbItemData.purchase_price = itemData.purchasePrice || null;
      if (itemData.taxRate !== undefined) dbItemData.tax_rate = itemData.taxRate || null;
      if (itemData.enableSaleInfo !== undefined) dbItemData.enable_sale_info = itemData.enableSaleInfo;
      if (itemData.enablePurchaseInfo !== undefined) dbItemData.enable_purchase_info = itemData.enablePurchaseInfo;
      if (itemData.unit !== undefined) dbItemData.unit = itemData.unit;
      dbItemData.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('items')
        .update(dbItemData)
        .eq('id', id);

      if (error) throw error;
      return await this.fetchItemById(id);
    } catch (error) {
      console.error('Error updating item:', error);
      throw error;
    }
  }

  async deleteItem(id: string): Promise<void> {
    try {
      if (itemsApiEnabled()) {
        await itemsApi.remove(id);
        return;
      }

      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting item:', error);
      throw error;
    }
  }

  async fetchCategories(): Promise<ItemCategory[]> {
    try {
      if (itemsApiEnabled()) {
        return (await itemsApi.list()).categories;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('item_categories')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching categories:', error);
        return [];
      }

      return (data || []).map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        userId: category.user_id,
        createdAt: category.created_at,
        updatedAt: category.updated_at,
      }));
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  }

  async getItemCategories(): Promise<ItemCategory[]> {
    return this.fetchCategories();
  }

  async createCategory(categoryData: Omit<ItemCategory, 'id' | 'createdAt' | 'updatedAt' | 'userId'>): Promise<ItemCategory> {
    try {
      if (itemsApiEnabled()) {
        return itemsApi.createCategory(categoryData);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('item_categories')
        .insert({
          name: categoryData.name,
          color: categoryData.color || null,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        color: data.color,
        userId: data.user_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }
}

export const itemService = new ItemService();
