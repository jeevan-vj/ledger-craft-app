import { invoiceImportExtractionDraftSchema, type InvoiceImportExtractionDraft } from '@ledgercraft/contracts';
import { apiError } from '../../../http-error';
import { documentContent } from './document-content';
import { applyExtractionHeuristics } from './extraction-heuristics';
import {
  extractionContextText,
  INVOICE_IMPORT_SYSTEM_PROMPT,
  invoiceProviderResponseJsonSchema,
  untrustedDocumentText,
} from './invoice-prompt';
import { normalizeProviderPayload } from './provider-output-normalization';
import type { InvoiceImportExtractionProvider } from './types';

export function createRemoteExtractionProvider(options: {
  provider: 'openai' | 'xai'; apiKey: string; fetchImpl?: typeof fetch;
}): InvoiceImportExtractionProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = options.provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions';
  const model = options.provider === 'openai' ? 'gpt-4o-mini' : 'grok-4-fast-non-reasoning';
  return {
    async extractDocument(file, context): Promise<InvoiceImportExtractionDraft> {
      const content = documentContent(file);
      const documentPart = typeof content === 'string'
        ? { type: 'text', text: untrustedDocumentText(content) }
        : { type: 'image_url', image_url: { url: content.dataUrl, detail: 'high' } };
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0, max_tokens: 3000,
          response_format: { type: 'json_schema', json_schema: { name: 'invoice_import_extraction', strict: true, schema: invoiceProviderResponseJsonSchema } },
          messages: [
            { role: 'system', content: INVOICE_IMPORT_SYSTEM_PROMPT },
            { role: 'user', content: [
              { type: 'text', text: extractionContextText(context) },
              documentPart,
            ] },
          ],
        }),
      });
      if (!response.ok) throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Invoice extraction provider failed');
      const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const raw = body.choices?.[0]?.message?.content;
      if (!raw) throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Invoice extraction provider returned no content');
      try {
        const normalized = normalizeProviderPayload(JSON.parse(raw));
        if (!normalized.success) throw new Error('invalid provider payload');
        const adjusted = applyExtractionHeuristics(normalized.data, context, {
          lineGstRatesRewritten: normalized.lineGstRatesRewritten,
        });
        return invoiceImportExtractionDraftSchema.parse({ ...adjusted, provider: options.provider, mock: false });
      } catch {
        throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Invoice extraction provider returned invalid structured data');
      }
    },
  };
}

