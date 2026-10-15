export interface ReceiptScanResult {
  merchantName: string | null;
  date: string | null;
  total: number | null;
  tax: number | null;
  subtotal: number | null;
  items: ReceiptItem[];
  paymentMethod: 'cash' | 'card' | 'other' | null;
  suggestedCategory: string | null;
  confidence: number;
  notes: string | null;
}

export interface ReceiptItem {
  description: string;
  quantity: number;
  price: number;
}

export interface ReceiptScanError {
  code: 'PROCESSING_ERROR' | 'INVALID_IMAGE' | 'API_ERROR' | 'NETWORK_ERROR';
  message: string;
}

export interface ReceiptScanOptions {
  model?: 'gpt-4o' | 'gpt-4o-mini';
  maxTokens?: number;
}