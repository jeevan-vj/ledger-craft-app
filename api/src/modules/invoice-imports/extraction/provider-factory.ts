import { apiError } from '../../../http-error';
import { createMockExtractionProvider } from './mock-provider';
import { createRemoteExtractionProvider } from './remote-provider';
import { createWorkersAiExtractionProvider } from './workers-ai-provider';
import type { WorkersAiBinding } from '../../ai/workers-ai';
import type { InvoiceImportExtractionProvider } from './types';

export type ExtractionEnv = {
  NODE_ENV?: string;
  APP_ENV?: string;
  OPENAI_API_KEY?: string;
  XAI_API_KEY?: string;
  INVOICE_IMPORT_AI_PROVIDER?: string;
  WORKERS_AI_MODEL?: string;
  WORKERS_AI_FAKE?: string;
  AI?: WorkersAiBinding;
};

function fakeWorkersAi(): WorkersAiBinding {
  const high = { value: 0.95, label: 'High' } as const;
  const missing = { value: 0, label: 'Missing' } as const;
  return {
    async toMarkdown() {
      return { format: 'markdown' as const, data: 'Kiwi Supplies Ltd\nTotal NZD 115.00' };
    },
    async run() {
      return { response: {
        issuerName: 'Kiwi Supplies Ltd', issuerGstNumber: '123-456-789',
        recipientName: 'Crystal Touch Cleaning', recipientGstNumber: null,
        documentNumber: 'KSL-2026-1001', issueDate: '2026-10-27', dueDate: '2026-11-10', currency: 'NZD',
        lineItems: [{ description: 'Cleaning supplies', quantity: '1', unitPrice: '100.00', amount: '100.00', gstRate: '15.00' }],
        net: '100.00', gst: '15.00', total: '115.00', suggestedDirection: 'PURCHASE',
        suggestedDirectionReason: 'The issuer is a supplier to the organisation.', thirdPartyIssued: false,
        confidence: {
          issuerName: high, issuerGstNumber: high, recipientName: high, recipientGstNumber: missing,
          documentNumber: high, issueDate: high, dueDate: high, currency: high, lineItems: [high],
          net: high, gst: high, total: high, suggestedDirection: high, thirdPartyIssued: high,
        },
      } };
    },
  };
}

function unavailable(provider: string): never {
  throw apiError(503, 'EXTRACTION_PROVIDER_UNAVAILABLE', `Invoice extraction provider ${provider} is not configured`);
}

export function createExtractionProvider(options: {
  env?: ExtractionEnv;
  fetchImpl?: typeof fetch;
} = {}): InvoiceImportExtractionProvider {
  const env: ExtractionEnv = options.env ?? {
    NODE_ENV: process.env.NODE_ENV,
    APP_ENV: process.env.APP_ENV,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    XAI_API_KEY: process.env.XAI_API_KEY,
    INVOICE_IMPORT_AI_PROVIDER: process.env.INVOICE_IMPORT_AI_PROVIDER,
    WORKERS_AI_MODEL: process.env.WORKERS_AI_MODEL,
    WORKERS_AI_FAKE: process.env.WORKERS_AI_FAKE,
  };
  const production = env.NODE_ENV === 'production' || env.APP_ENV === 'production';
  const ai = env.AI ?? ((!production && env.WORKERS_AI_FAKE === '1') ? fakeWorkersAi() : undefined);
  const override = env.INVOICE_IMPORT_AI_PROVIDER;
  if (override) {
    if (override === 'openai') {
      if (!env.OPENAI_API_KEY) return unavailable(override);
      return createRemoteExtractionProvider({ provider: 'openai', apiKey: env.OPENAI_API_KEY, fetchImpl: options.fetchImpl });
    }
    if (override === 'xai') {
      if (!env.XAI_API_KEY) return unavailable(override);
      return createRemoteExtractionProvider({ provider: 'xai', apiKey: env.XAI_API_KEY, fetchImpl: options.fetchImpl });
    }
    if (override === 'workers-ai') {
      if (!ai) return unavailable(override);
      return createWorkersAiExtractionProvider({ ai, model: env.WORKERS_AI_MODEL });
    }
    if (override === 'mock') {
      if (production) return unavailable(override);
      return createMockExtractionProvider();
    }
    return unavailable(override);
  }
  if (env.OPENAI_API_KEY) return createRemoteExtractionProvider({ provider: 'openai', apiKey: env.OPENAI_API_KEY, fetchImpl: options.fetchImpl });
  if (env.XAI_API_KEY) return createRemoteExtractionProvider({ provider: 'xai', apiKey: env.XAI_API_KEY, fetchImpl: options.fetchImpl });
  if (ai) return createWorkersAiExtractionProvider({ ai, model: env.WORKERS_AI_MODEL });
  const namedNonProduction = ['development', 'test', 'demo'].includes(env.APP_ENV ?? '')
    || ['development', 'test'].includes(env.NODE_ENV ?? '');
  if (!production && namedNonProduction) {
    return createMockExtractionProvider();
  }
  throw apiError(503, 'EXTRACTION_PROVIDER_UNAVAILABLE', 'Invoice extraction is not configured');
}

