export const mockCustomer = {
  id: 'test-customer-id-1',
  name: 'TEST_John Doe',
  email: 'johndoe@test.com',
  phone: '+64 21 123 4567',
  address: '456 Test Ave',
  city: 'Wellington',
  state: 'Wellington',
  zip: '6011',
  country: 'New Zealand',
  userId: 'test-user-id',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockCustomers = [
  mockCustomer,
  {
    id: 'test-customer-id-2',
    name: 'TEST_Jane Smith',
    email: 'janesmith@test.com',
    phone: '+64 21 987 6543',
    address: '789 Test Road',
    city: 'Christchurch',
    state: 'Canterbury',
    zip: '8011',
    country: 'New Zealand',
    userId: 'test-user-id',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const mockCustomerInput = {
  name: 'TEST_New Customer',
  email: 'newcustomer@test.com',
  phone: '+64 21 555 1234',
  address: '321 Test Lane',
  city: 'Auckland',
  state: 'Auckland',
  zip: '1010',
  country: 'New Zealand',
};

