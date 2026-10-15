import { itemService } from '@/services/itemService';
import { getAuthenticatedSupabaseClient, cleanupTestData } from '@/__tests__/setup/testEnv';
import { mockItemInput } from '@/__tests__/fixtures/item.fixtures';

describe('ItemService', () => {
  let supabase: Awaited<ReturnType<typeof getAuthenticatedSupabaseClient>>;
  const createdItemIds: string[] = [];

  beforeAll(async () => {
    process.env.EXPO_PUBLIC_ITEMS_API = 'false';
    supabase = await getAuthenticatedSupabaseClient();
  });

  afterEach(async () => {
    // Clean up test items
    if (createdItemIds.length > 0) {
      await supabase
        .from('items')
        .delete()
        .in('id', createdItemIds);
      createdItemIds.length = 0;
    }
    await cleanupTestData.deleteItems(supabase);
  });

  describe('createItem', () => {
    it('should create a service item with valid data', async () => {
      const testData = {
        ...mockItemInput,
        name: `TEST_${Date.now()}_Service`,
        type: 'service' as const,
      };

      const item = await itemService.createItem(testData);
      createdItemIds.push(item.id);

      expect(item).toBeDefined();
      expect(item.name).toBe(testData.name);
      expect(item.type).toBe('service');
      expect(item.salePrice).toBe(testData.salePrice);
      expect(item.unit).toBe(testData.unit);
    });

    it('should create a product item with valid data', async () => {
      const testData = {
        ...mockItemInput,
        name: `TEST_${Date.now()}_Product`,
        type: 'product' as const,
      };

      const item = await itemService.createItem(testData);
      createdItemIds.push(item.id);

      expect(item).toBeDefined();
      expect(item.name).toBe(testData.name);
      expect(item.type).toBe('product');
    });

    it('should transform snake_case columns to camelCase', async () => {
      const testData = {
        ...mockItemInput,
        name: `TEST_${Date.now()}_CaseTransform`,
      };

      const item = await itemService.createItem(testData);
      createdItemIds.push(item.id);

      // Verify camelCase fields exist (transformed from snake_case)
      expect(item.salePrice).toBeDefined();
      expect(item.categoryId).toBeDefined();
      expect(item.userId).toBeDefined();
      expect(item.createdAt).toBeDefined();
      expect(item.updatedAt).toBeDefined();
    });
  });

  describe('getItems', () => {
    it('should filter items by type correctly', async () => {
      // Create one service and one product
      const service = await itemService.createItem({
        ...mockItemInput,
        name: `TEST_${Date.now()}_FilterService`,
        type: 'service',
      });
      const product = await itemService.createItem({
        ...mockItemInput,
        name: `TEST_${Date.now()}_FilterProduct`,
        type: 'product',
      });
      createdItemIds.push(service.id, product.id);

      // Get only services
      const services = await itemService.getItems('service');
      expect(services.some(i => i.id === service.id)).toBe(true);
      expect(services.every(i => i.type === 'service')).toBe(true);

      // Get only products
      const products = await itemService.getItems('product');
      expect(products.some(i => i.id === product.id)).toBe(true);
      expect(products.every(i => i.type === 'product')).toBe(true);
    });

    it('should return all items when no type specified', async () => {
      const service = await itemService.createItem({
        ...mockItemInput,
        name: `TEST_${Date.now()}_AllService`,
        type: 'service',
      });
      const product = await itemService.createItem({
        ...mockItemInput,
        name: `TEST_${Date.now()}_AllProduct`,
        type: 'product',
      });
      createdItemIds.push(service.id, product.id);

      const allItems = await itemService.getItems();
      
      expect(allItems.length).toBeGreaterThanOrEqual(2);
      expect(allItems.some(i => i.id === service.id)).toBe(true);
      expect(allItems.some(i => i.id === product.id)).toBe(true);
    });
  });

  describe('getItemCategories', () => {
    it('should return item categories', async () => {
      const categories = await itemService.getItemCategories();

      expect(categories).toBeDefined();
      expect(Array.isArray(categories)).toBe(true);
    });
  });

  describe('updateItem', () => {
    it('should update item fields correctly', async () => {
      const item = await itemService.createItem({
        ...mockItemInput,
        name: `TEST_${Date.now()}_UpdateItem`,
      });
      createdItemIds.push(item.id);

      const updatedData = {
        name: `TEST_${Date.now()}_Updated`,
        salePrice: 200,
        unit: 'day',
      };

      const updated = await itemService.updateItem(item.id, updatedData);

      expect(updated).toBeDefined();
      expect(updated.name).toBe(updatedData.name);
      expect(updated.salePrice).toBe(updatedData.salePrice);
      expect(updated.unit).toBe(updatedData.unit);
    });
  });

  describe('deleteItem', () => {
    it('should delete item successfully', async () => {
      const item = await itemService.createItem({
        ...mockItemInput,
        name: `TEST_${Date.now()}_DeleteItem`,
      });

      await itemService.deleteItem(item.id);

      const { data, error } = await supabase
        .from('items')
        .select('id')
        .eq('id', item.id)
        .maybeSingle();

      expect(data).toBeNull();
    });
  });
});

