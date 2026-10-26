import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptScanner } from '../ReceiptScanner';

const useReceiptScanning = vi.fn();

vi.mock('@/hooks/useReceiptScanning', () => ({ useReceiptScanning: () => useReceiptScanning() }));
vi.mock('@/services/storageService', () => ({ storageService: { uploadReceipt: vi.fn() } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('ReceiptScanner', () => {
  beforeEach(() => {
    useReceiptScanning.mockReturnValue({
      isScanning: false,
      scanResult: {
        merchantName: 'Kiwi Supplies Ltd', date: '2026-10-27', total: 11.5, tax: 1.5,
        subtotal: 10, items: [], paymentMethod: 'card', suggestedCategory: 'Office Supplies',
        confidence: 60, notes: null, provider: 'workers-ai',
      },
      error: null,
      isAvailable: true,
      scanReceipt: vi.fn(),
      clearResult: vi.fn(),
      clearError: vi.fn(),
    });
  });

  it('warns that Workers AI receipt data needs careful review', () => {
    render(<ReceiptScanner onScanComplete={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Scanned with Cloudflare Workers AI, check carefully')).toBeInTheDocument();
  });
});
