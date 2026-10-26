import { useState, useCallback, useEffect } from 'react';
import { openaiReceiptService, OpenAIReceiptService, ReceiptScanError } from '@/services/openaiReceiptService';
import { ReceiptScanResult } from '@/types/receipt';

interface UseReceiptScanningResult {
  isScanning: boolean;
  scanResult: ReceiptScanResult | null;
  error: string | null;
  isAvailable: boolean;
  scanReceipt: (file: File) => Promise<void>;
  clearResult: () => void;
  clearError: () => void;
}

export const useReceiptScanning = (): UseReceiptScanningResult => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isAvailable, setIsAvailable] = useState(false);
  useEffect(() => { void openaiReceiptService.isAvailable().then(setIsAvailable); }, []);

  const scanReceipt = useCallback(async (file: File) => {
    if (!isAvailable) {
      setError('Receipt scanning is not available. Please check your OpenAI API key configuration.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }

    // Clear previous state
    setError(null);
    setScanResult(null);
    setIsScanning(true);

    try {
      // Compress image to reduce API costs and improve performance
      const compressedImage = await OpenAIReceiptService.compressImage(file, 1024, 0.8);
      
      // Scan the receipt
      const result = await openaiReceiptService.scanReceipt(compressedImage, {
        model: 'gpt-4o-mini' // Use cost-effective model
      });

      setScanResult(result);

      // Log for debugging (remove in production)
      console.log('Receipt scan result:', result);

    } catch (err) {
      console.error('Receipt scanning failed:', err);
      
      if (err instanceof ReceiptScanError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while scanning the receipt. Please try again.');
      }
    } finally {
      setIsScanning(false);
    }
  }, [isAvailable]);

  const clearResult = useCallback(() => {
    setScanResult(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isScanning,
    scanResult,
    error,
    isAvailable,
    scanReceipt,
    clearResult,
    clearError
  };
};
