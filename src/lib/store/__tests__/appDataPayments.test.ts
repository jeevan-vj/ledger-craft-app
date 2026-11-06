import { expect, it, vi } from 'vitest';
import { useStore } from '../index';
import { paymentService } from '@/services/paymentService';

vi.mock('@/services/paymentService', () => ({ paymentService: { getPaymentsByInvoice: vi.fn() } }));

it('loads an invoice payment list through the payment service instead of a missing manager method', async () => {
  vi.mocked(paymentService.getPaymentsByInvoice).mockResolvedValue([]);
  await expect(useStore.getState().getPaymentsByInvoice('invoice-1')).resolves.toEqual([]);
  expect(paymentService.getPaymentsByInvoice).toHaveBeenCalledWith('invoice-1');
});
