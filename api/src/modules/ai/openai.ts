import {
  receiptScanResultSchema,
  type ChatCompletionRequest,
  type ReceiptScanResultDto,
  type ScanReceiptRequest,
} from '@ledgercraft/contracts';
import { apiError } from '../../http-error';
import type { AiProviderEnv } from '../../env';
import type { ChatCompleter } from './chat';
import type { ReceiptScanner } from './scanner';

const PROMPT = `You are a receipt data extraction expert. Analyze this receipt image and extract the following information in JSON format:

{
  "merchantName": "Business name from receipt (string or null)",
  "date": "Transaction date in YYYY-MM-DD format (string or null)",
  "total": "Total amount as number (number or null)",
  "tax": "Tax amount as number (number or null)",
  "subtotal": "Subtotal before tax (number or null)",
  "items": [
    {
      "description": "Item name/description (string)",
      "quantity": "Number of items (number, default 1)",
      "price": "Item price as number (number)"
    }
  ],
  "paymentMethod": "cash, card, or other (string or null)",
  "suggestedCategory": "One of: Food & Beverage, Transportation, Office Supplies, Travel, Entertainment, Health & Medical, Shopping, Utilities, Other (string or null)",
  "confidence": "0-100 score of extraction confidence (number)",
  "notes": "Any additional relevant information (string or null)"
}

Extract only information clearly visible in the receipt. Use null for missing information. Return valid JSON only.`;

function asDataUrl(imageBase64: string, contentType?: string): string {
  if (imageBase64.startsWith('data:')) return imageBase64;
  return `data:${contentType ?? 'image/jpeg'};base64,${imageBase64}`;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sanitize(raw: unknown): ReceiptScanResultDto {
  const value = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(value.items)
    ? value.items
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item != null)
        .map((item) => ({
          description: typeof item.description === 'string' ? item.description : '',
          quantity: asNumber(item.quantity) ?? 1,
          price: asNumber(item.price) ?? 0,
        }))
        .filter((item) => item.description.length > 0)
    : [];
  const paymentMethod =
    value.paymentMethod === 'cash' || value.paymentMethod === 'card' || value.paymentMethod === 'other'
      ? value.paymentMethod
      : null;
  return receiptScanResultSchema.parse({
    merchantName: typeof value.merchantName === 'string' ? value.merchantName : null,
    date: typeof value.date === 'string' ? value.date : null,
    total: asNumber(value.total),
    tax: asNumber(value.tax),
    subtotal: asNumber(value.subtotal),
    items,
    paymentMethod,
    suggestedCategory: typeof value.suggestedCategory === 'string' ? value.suggestedCategory : null,
    confidence: asNumber(value.confidence) ?? 0,
    notes: typeof value.notes === 'string' ? value.notes : null,
  });
}

type AiProviderOptions = {
  apiKey?: string;
  xaiApiKey?: string;
  openAiApiKey?: string;
  env?: AiProviderEnv;
  fetchImpl?: typeof fetch;
};

function provider(options?: AiProviderOptions) {
  const openAiApiKey = options?.openAiApiKey ?? options?.apiKey ?? options?.env?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (openAiApiKey) return { apiKey: openAiApiKey, url: 'https://api.openai.com/v1/chat/completions', receiptModel: 'gpt-4o-mini', chatModel: 'gpt-3.5-turbo' };
  const xaiApiKey = options?.xaiApiKey ?? options?.env?.XAI_API_KEY ?? process.env.XAI_API_KEY;
  if (xaiApiKey) return { apiKey: xaiApiKey, url: 'https://api.x.ai/v1/chat/completions', receiptModel: 'grok-4-fast-non-reasoning', chatModel: 'grok-4-fast-non-reasoning' };
  return undefined;
}

export function createOpenAiReceiptScanner(opts?: AiProviderOptions): ReceiptScanner {
  const configured = provider(opts);
  const fetchImpl = opts?.fetchImpl ?? fetch;
  return {
    async scan(input: ScanReceiptRequest) {
      if (!configured) {
        throw apiError(503, 'AI_UNAVAILABLE', 'Receipt scanning is not configured');
      }
      const response = await fetchImpl(configured.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configured.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: configured.receiptModel,
          max_tokens: 1000,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: PROMPT },
                { type: 'image_url', image_url: { url: asDataUrl(input.imageBase64, input.contentType), detail: 'high' } },
              ],
            },
          ],
        }),
      });
      if (!response.ok) {
        throw apiError(502, 'AI_ERROR', 'Receipt scanning failed');
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw apiError(502, 'AI_ERROR', 'Receipt scanning returned no content');
      }
      try {
        return sanitize(JSON.parse(content));
      } catch {
        throw apiError(502, 'AI_ERROR', 'Receipt scanning returned invalid JSON');
      }
    },
  };
}

export function createOpenAiChatCompleter(opts?: AiProviderOptions): ChatCompleter {
  const configured = provider(opts);
  const fetchImpl = opts?.fetchImpl ?? fetch;
  return {
    async complete(messages: ChatCompletionRequest['messages']) {
      if (!configured) {
        throw apiError(503, 'AI_UNAVAILABLE', 'Chat completions are not configured');
      }
      const response = await fetchImpl(configured.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configured.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: configured.chatModel,
          messages,
          max_tokens: 500,
          temperature: 0.3,
        }),
      });
      if (!response.ok) {
        throw apiError(502, 'AI_ERROR', 'Chat completion failed');
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (content == null) {
        throw apiError(502, 'AI_ERROR', 'Chat completion returned no content');
      }
      return content;
    },
  };
}
