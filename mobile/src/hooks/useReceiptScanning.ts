import { useState, useCallback, useEffect } from 'react';
import { openaiReceiptService, OpenAIReceiptService } from '@/services/openaiReceiptService';
import { storageService } from '@/services/storageService';
import { ReceiptScanResult } from '@/types/receipt';

interface UseReceiptScanningResult {
  isScanning: boolean;
  isUploading: boolean;
  scanResult: ReceiptScanResult | null;
  error: string | null;
  isAvailable: boolean;
  scanReceipt: (uri: string) => Promise<void>;
  uploadReceipt: (uri: string, expenseId?: string) => Promise<string | null>;
  clearResult: () => void;
  clearError: () => void;
}

export const useReceiptScanning = (): UseReceiptScanningResult => {
  const [isScanning, setIsScanning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isAvailable, setIsAvailable] = useState(false);
  useEffect(() => { void openaiReceiptService.isAvailable().then(setIsAvailable); }, []);

  const scanReceipt = useCallback(async (uri: string) => {
    if (!isAvailable) {
      setError('Receipt scanning is not available. Please check your OpenAI API key configuration.');
      return;
    }

    // Clear previous state
    setError(null);
    setScanResult(null);
    setIsScanning(true);

    try {
      // Compress image to reduce API costs and improve performance
      const compressedImage = await OpenAIReceiptService.compressImage(uri, 1024, 0.8);
      
      // Scan the receipt
      const result = await openaiReceiptService.scanReceipt(compressedImage, {
        model: 'gpt-4o-mini' // Use cost-effective model
      });

      setScanResult(result);

      // Log for debugging
      console.log('Receipt scan result:', result);

    } catch (err) {
      console.error('Receipt scanning failed:', err);
      
      if (err instanceof Error && 'code' in err && 'message' in err) {
        setError(err.message as string);
      } else {
        setError('An unexpected error occurred while scanning the receipt. Please try again.');
      }
    } finally {
      setIsScanning(false);
    }
  }, [isAvailable]);

  const uploadReceipt = useCallback(async (uri: string, expenseId?: string): Promise<string | null> => {
    setIsUploading(true);
    try {
      const result = await storageService.uploadReceipt(uri, expenseId);
      return result?.url || null;
    } catch (err) {
      console.error('Receipt upload failed:', err);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setScanResult(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isScanning,
    isUploading,
    scanResult,
    error,
    isAvailable,
    scanReceipt,
    uploadReceipt,
    clearResult,
    clearError
  };
};

