import { apiError } from '../../../http-error';
import { createMockExtractionProvider } from './mock-provider';
import { createRemoteExtractionProvider } from './remote-provider';
import type { InvoiceImportExtractionProvider } from './types';

type ExtractionEnv = {
  NODE_ENV?: string;
  APP_ENV?: string;
  OPENAI_API_KEY?: string;
  XAI_API_KEY?: string;
  INVOICE_IMPORT_AI_PROVIDER?: string;
};

export function createExtractionProvider(options: {
  env?: ExtractionEnv;
  fetchImpl?: typeof fetch;
} = {}): InvoiceImportExtractionProvider {
  const env = options.env ?? process.env;
  const production = env.NODE_ENV === 'production' || env.APP_ENV === 'production';
  if (env.OPENAI_API_KEY) return createRemoteExtractionProvider({ provider: 'openai', apiKey: env.OPENAI_API_KEY, fetchImpl: options.fetchImpl });
  if (env.XAI_API_KEY) return createRemoteExtractionProvider({ provider: 'xai', apiKey: env.XAI_API_KEY, fetchImpl: options.fetchImpl });
  const namedNonProduction = ['development', 'test', 'demo'].includes(env.APP_ENV ?? '')
    || ['development', 'test'].includes(env.NODE_ENV ?? '');
  if (!production && (namedNonProduction || env.INVOICE_IMPORT_AI_PROVIDER === 'mock')) {
    return createMockExtractionProvider();
  }
  throw apiError(503, 'EXTRACTION_PROVIDER_UNAVAILABLE', 'Invoice extraction is not configured');
}

