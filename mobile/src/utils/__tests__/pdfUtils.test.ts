import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import type { Invoice } from '@/types/invoice';
import * as Sharing from 'expo-sharing';
import { downloadInvoicePDF, generateInvoicePDF, invoiceFileName, shareInvoicePDF } from '../pdfUtils';

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
  printAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-file-system/legacy', () => {
  const state: { documentDirectory: string | null } = { documentDirectory: null };
  return {
    get documentDirectory() {
      return state.documentDirectory;
    },
    set documentDirectory(value: string | null) {
      state.documentDirectory = value;
    },
    EncodingType: { Base64: 'base64' },
    StorageAccessFramework: {
      requestDirectoryPermissionsAsync: jest.fn(),
      createFileAsync: jest.fn(),
    },
    readAsStringAsync: jest.fn(),
    writeAsStringAsync: jest.fn(),
    getInfoAsync: jest.fn(),
    copyAsync: jest.fn(),
    deleteAsync: jest.fn(),
  };
});

const invoice = {
  id: 'invoice-1',
  invoiceNumber: 'INV/2026 0042',
  customerId: 'customer-1',
  date: '2026-10-01',
  dueDate: '2026-10-15',
  items: [],
  subtotal: 100,
  taxAmount: 15,
  total: 115,
  status: 'sent',
  currency: 'NZD',
} as Invoice;

describe('mobile invoice PDF saving', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    jest.clearAllMocks();
  });

  it('creates a stable filesystem-safe invoice filename', () => {
    expect(invoiceFileName('INV/2026 0042')).toBe('Invoice-INV-2026-0042.pdf');
    expect(invoiceFileName('   ')).toBe('Invoice-Draft.pdf');
  });

  it('names a quote PDF failure as a quote and keeps invoice failures as invoices', async () => {
    jest.mocked(Print.printToFileAsync).mockRejectedValue(new Error('disk full'));
    await expect(generateInvoicePDF(invoice)).rejects.toThrow('Could not generate the invoice PDF: disk full');
    await expect(generateInvoicePDF(invoice, undefined, 'modern', { filePrefix: 'Quote' })).rejects.toThrow(
      'Could not generate the quote PDF: disk full',
    );
  });

  it('writes the generated PDF to a selected Android directory', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    jest.mocked(Print.printToFileAsync).mockResolvedValue({ uri: 'file:///cache/invoice.pdf' } as never);
    jest.mocked(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync).mockResolvedValue({
      granted: true,
      directoryUri: 'content://downloads',
    } as never);
    jest.mocked(FileSystem.readAsStringAsync).mockResolvedValue('JVBERi0xLjQ=');
    jest.mocked(FileSystem.StorageAccessFramework.createFileAsync).mockResolvedValue(
      'content://downloads/Invoice-INV-2026-0042.pdf',
    );

    await expect(downloadInvoicePDF(invoice)).resolves.toBe(
      'content://downloads/Invoice-INV-2026-0042.pdf',
    );
    expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      'content://downloads',
      'Invoice-INV-2026-0042.pdf',
      'application/pdf',
    );
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'content://downloads/Invoice-INV-2026-0042.pdf',
      'JVBERi0xLjQ=',
      { encoding: 'base64' },
    );
  });

  it('shares a PDF named Invoice-<number>.pdf', async () => {
    Object.assign(FileSystem, { documentDirectory: 'file:///docs/' });
    jest.mocked(Print.printToFileAsync).mockResolvedValue({ uri: 'file:///cache/invoice.pdf' } as never);
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: false } as never);
    jest.mocked(FileSystem.copyAsync).mockResolvedValue(undefined as never);
    jest.mocked(FileSystem.deleteAsync).mockResolvedValue(undefined as never);

    await shareInvoicePDF(invoice);

    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///docs/Invoice-INV-2026-0042.pdf',
      expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }),
    );
  });

  it('treats dismissing the PDF share sheet as cancellation', async () => {
    Object.assign(FileSystem, { documentDirectory: null });
    jest.mocked(Print.printToFileAsync).mockResolvedValue({ uri: 'file:///cache/invoice.pdf' } as never);
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(
      Object.assign(new Error('The app share was cancelled'), { code: 'ERR_SHARING_CANCELLED' }),
    );

    await expect(shareInvoicePDF(invoice)).resolves.toBeUndefined();
  });

  it('treats dismissing the save sheet as cancellation', async () => {
    Object.assign(FileSystem, { documentDirectory: null });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    jest.mocked(Print.printToFileAsync).mockResolvedValue({ uri: 'file:///cache/invoice.pdf' } as never);
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('User did not share'));

    await expect(downloadInvoicePDF(invoice)).resolves.toBeNull();
  });

  it('treats closing the Android directory picker as cancellation', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    jest.mocked(Print.printToFileAsync).mockResolvedValue({ uri: 'file:///cache/invoice.pdf' } as never);
    jest.mocked(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync).mockResolvedValue({
      granted: false,
      directoryUri: null,
    } as never);

    await expect(downloadInvoicePDF(invoice)).resolves.toBeNull();
    expect(FileSystem.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();
  });
});
