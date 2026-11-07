export interface ReceiptScanResult {
  merchantName: string | null;
  receiptHash?: string;
  date: string | null;
  total: string | null;
  tax: string | null;
  subtotal: string | null;
  items: ReceiptItem[];
  paymentMethod: 'cash' | 'card' | 'other' | null;
  suggestedCategory: string | null;
  confidence: number;
  notes: string | null;
  provider?: 'openai' | 'xai' | 'workers-ai';
}

export interface ReceiptItem {
  description: string;
  quantity: string;
  price: string;
}

export interface ReceiptScanOptions {
  model?: 'gpt-4o' | 'gpt-4o-mini';
  maxTokens?: number;
}

