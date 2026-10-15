export const mockItem = {
  id: 'test-item-id-1',
  name: 'TEST_Web Development Service',
  description: 'Full-stack web development',
  type: 'service' as const,
  unit: 'hour',
  salePrice: 150,
  userId: 'test-user-id',
  categoryId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockItems = [
  mockItem,
  {
    id: 'test-item-id-2',
    name: 'TEST_Software License',
    description: 'Annual software license',
    type: 'product' as const,
    unit: 'license',
    salePrice: 500,
    userId: 'test-user-id',
    categoryId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const mockItemCategory = {
  id: 'test-category-id-1',
  name: 'TEST_Professional Services',
  userId: 'test-user-id',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockItemInput = {
  name: 'TEST_New Service',
  description: 'New service item',
  type: 'service' as const,
  unit: 'hour',
  salePrice: 100,
  categoryId: null,
};

