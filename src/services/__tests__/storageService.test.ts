import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storageService } from '../storageService';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        remove: vi.fn(),
        getPublicUrl: vi.fn(),
        list: vi.fn(),
      })),
    },
  },
}));

describe('storageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload file and return public URL', async () => {
      const mockFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockPath = 'test/test.jpg';
      const mockPublicUrl = 'https://storage.example.com/test.jpg';

      const mockStorage = {
        upload: vi.fn().mockResolvedValue({ data: { path: mockPath }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: mockPublicUrl } }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.uploadFile(mockFile, mockPath);

      expect(supabase.storage.from).toHaveBeenCalledWith('business-assets');
      expect(mockStorage.upload).toHaveBeenCalledWith(mockPath, mockFile);
      expect(mockStorage.getPublicUrl).toHaveBeenCalledWith(mockPath);
      expect(result).toBe(mockPublicUrl);
    });

    it('should return null on upload error', async () => {
      const mockFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const mockPath = 'test/test.jpg';

      const mockStorage = {
        upload: vi.fn().mockResolvedValue({ data: null, error: new Error('Upload failed') }),
        getPublicUrl: vi.fn(),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.uploadFile(mockFile, mockPath);

      expect(result).toBeNull();
      expect(mockStorage.getPublicUrl).not.toHaveBeenCalled();
    });
  });

  describe('uploadReceipt', () => {
    it('should upload receipt with generated filename', async () => {
      const mockFile = new File(['receipt'], 'my-receipt.jpg', { type: 'image/jpeg' });
      const mockPublicUrl = 'https://storage.example.com/receipts/receipt-123.jpg';

      const mockStorage = {
        upload: vi.fn().mockResolvedValue({ data: { path: 'receipts/receipt-123.jpg' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: mockPublicUrl } }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.uploadReceipt(mockFile);

      expect(result).toEqual({
        url: mockPublicUrl,
        path: expect.stringMatching(/^receipts\/receipt-.*\.jpg$/),
      });
      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^receipts\/receipt-.*\.jpg$/),
        mockFile,
        { cacheControl: '3600', upsert: false }
      );
    });

    it('should include expense ID in filename when provided', async () => {
      const mockFile = new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' });
      const expenseId = 'expense-123';

      const mockStorage = {
        upload: vi.fn().mockResolvedValue({ data: { path: 'receipts/receipt-expense-123.jpg' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://storage.example.com/receipt.jpg' } }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      await storageService.uploadReceipt(mockFile, expenseId);

      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^receipts\/receipt-expense-123-.*\.jpg$/),
        mockFile,
        { cacheControl: '3600', upsert: false }
      );
    });

    it('should handle file without extension', async () => {
      const mockFile = new File(['receipt'], 'receipt', { type: 'image/jpeg' });

      const mockStorage = {
        upload: vi.fn().mockResolvedValue({ data: { path: 'receipts/receipt.receipt' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://storage.example.com/receipt.receipt' } }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      await storageService.uploadReceipt(mockFile);

      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^receipts\/receipt-.*\.receipt$/),
        mockFile,
        { cacheControl: '3600', upsert: false }
      );
    });

    it('should return null on upload error', async () => {
      const mockFile = new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' });

      const mockStorage = {
        upload: vi.fn().mockResolvedValue({ data: null, error: new Error('Upload failed') }),
        getPublicUrl: vi.fn(),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.uploadReceipt(mockFile);

      expect(result).toBeNull();
    });
  });

  describe('deleteReceipt', () => {
    it('should delete receipt by file path', async () => {
      const filePath = 'receipts/receipt-123.jpg';

      const mockStorage = {
        remove: vi.fn().mockResolvedValue({ error: null }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.deleteReceipt(filePath);

      expect(mockStorage.remove).toHaveBeenCalledWith([filePath]);
      expect(result).toBe(true);
    });

    it('should extract path from full URL', async () => {
      const fullUrl = 'https://example.supabase.co/storage/v1/object/public/business-assets/receipts/receipt-123.jpg';
      const expectedPath = 'receipts/receipt-123.jpg';

      const mockStorage = {
        remove: vi.fn().mockResolvedValue({ error: null }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.deleteReceipt(fullUrl);

      expect(mockStorage.remove).toHaveBeenCalledWith([expectedPath]);
      expect(result).toBe(true);
    });

    it('should return false on delete error', async () => {
      const filePath = 'receipts/receipt-123.jpg';

      const mockStorage = {
        remove: vi.fn().mockResolvedValue({ error: new Error('Delete failed') }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.deleteReceipt(filePath);

      expect(result).toBe(false);
    });
  });

  describe('deleteFile', () => {
    it('should delete file and return true on success', async () => {
      const filePath = 'test/file.jpg';

      const mockStorage = {
        remove: vi.fn().mockResolvedValue({ error: null }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.deleteFile(filePath);

      expect(mockStorage.remove).toHaveBeenCalledWith([filePath]);
      expect(result).toBe(true);
    });

    it('should return false on delete error', async () => {
      const filePath = 'test/file.jpg';

      const mockStorage = {
        remove: vi.fn().mockResolvedValue({ error: new Error('Delete failed') }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.deleteFile(filePath);

      expect(result).toBe(false);
    });
  });

  describe('getFileInfo', () => {
    it('should return file information', async () => {
      const filePath = 'receipts/receipt-123.jpg';
      const mockFileInfo = {
        metadata: {
          size: 1024,
          mimetype: 'image/jpeg',
        },
        updated_at: '2024-01-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
      };

      const mockStorage = {
        list: vi.fn().mockResolvedValue({
          data: [mockFileInfo],
          error: null,
        }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.getFileInfo(filePath);

      expect(mockStorage.list).toHaveBeenCalledWith('receipts', {
        search: 'receipt-123.jpg',
      });
      expect(result).toEqual({
        size: 1024,
        contentType: 'image/jpeg',
        lastModified: '2024-01-01T00:00:00Z',
      });
    });

    it('should return null when file not found', async () => {
      const filePath = 'receipts/nonexistent.jpg';

      const mockStorage = {
        list: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.getFileInfo(filePath);

      expect(result).toBeNull();
    });

    it('should return null on list error', async () => {
      const filePath = 'receipts/receipt-123.jpg';

      const mockStorage = {
        list: vi.fn().mockResolvedValue({
          data: null,
          error: new Error('List failed'),
        }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.getFileInfo(filePath);

      expect(result).toBeNull();
    });

    it('should handle missing metadata gracefully', async () => {
      const filePath = 'receipts/receipt-123.jpg';
      const mockFileInfo = {
        updated_at: '2024-01-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
      };

      const mockStorage = {
        list: vi.fn().mockResolvedValue({
          data: [mockFileInfo],
          error: null,
        }),
      };

      vi.mocked(supabase.storage.from).mockReturnValue(mockStorage as unknown as ReturnType<typeof supabase.storage.from>);

      const result = await storageService.getFileInfo(filePath);

      expect(result).toEqual({
        size: 0,
        contentType: '',
        lastModified: '2024-01-01T00:00:00Z',
      });
    });
  });
});