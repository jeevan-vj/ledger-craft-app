import { itemService } from '@/services/itemService';

const serviceDto = {
  id: 'item-service', name: 'Consulting', description: null, type: 'service' as const,
  categoryId: null, salePrice: '150.00', purchasePrice: null, taxRate: '15',
  enableSaleInfo: true, enablePurchaseInfo: false, unit: 'hour',
  createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z',
};
const productDto = { ...serviceDto, id: 'item-product', name: 'Notebook', type: 'product' as const, unit: 'unit' };
const categoryDto = { id: 'category-1', name: 'Services', color: '#163300', createdAt: serviceDto.createdAt, updatedAt: serviceDto.updatedAt };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
}

describe('ItemService (Hono)', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_ITEMS_API = 'true';
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3001';
    global.fetch = jest.fn();
  });
  afterEach(() => jest.resetAllMocks());

  it('creates an item through POST /api/items', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(serviceDto, 201));
    const item = await itemService.createItem({
      name: serviceDto.name, description: null, type: 'service', categoryId: null,
      salePrice: 150, purchasePrice: null, taxRate: 15,
      enableSaleInfo: true, enablePurchaseInfo: false, unit: 'hour',
    });
    expect(item.salePrice).toBe(150);
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:3001/api/items', expect.objectContaining({ method: 'POST' }));
  });

  it('lists and filters items through GET /api/items', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ items: [serviceDto, productDto], categories: [categoryDto] }));
    await expect(itemService.getItems('service')).resolves.toEqual([expect.objectContaining({ id: serviceDto.id })]);
    await expect(itemService.getItems()).resolves.toHaveLength(2);
    await expect(itemService.getItemCategories()).resolves.toEqual([expect.objectContaining({ id: categoryDto.id })]);
  });

  it('updates and deletes items through the API', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ ...serviceDto, name: 'Advisory' }))
      .mockResolvedValueOnce(jsonResponse(undefined, 204));
    await expect(itemService.updateItem(serviceDto.id, { name: 'Advisory' })).resolves.toEqual(expect.objectContaining({ name: 'Advisory' }));
    await expect(itemService.deleteItem(serviceDto.id)).resolves.toBeUndefined();
  });
});
