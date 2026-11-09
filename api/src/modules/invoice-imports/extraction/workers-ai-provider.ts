import { invoiceImportExtractionDraftSchema } from '@ledgercraft/contracts';
import { apiError } from '../../../http-error';
import {
  DEFAULT_WORKERS_AI_MODEL,
  DEFAULT_WORKERS_AI_TEXT_MODEL,
  parseWorkersAiJson,
  workersAiRunError,
  type WorkersAiBinding,
} from '../../ai/workers-ai';
import { assertPdfWithinPageCap } from '../invoice-import-validation';
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

const RETRY_NOTE = 'Your previous reply was not valid JSON for the schema. Return only one valid JSON object with every required field.';
const MAX_CONVERTED_DOCUMENT_CHARS = 30_000;

export function boundedConvertedText(value: string): string {
  // Strip control characters and fence markers so converted text cannot close the untrusted boundary.
  // eslint-disable-next-line no-control-regex
  const withoutControls = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const withoutInvisible = [
    '\u00ad', '\u200b', '\u200c', '\u200d', '\u200e', '\u200f', '\u202a', '\u202b', '\u202c', '\u202d', '\u202e',
    '\u2060', '\u2066', '\u2067', '\u2068', '\u2069', '\ufeff',
  ].reduce((text, mark) => text.replaceAll(mark, ''), withoutControls);
  const withoutMarkers = withoutInvisible.replace(/(?:begin|end)[\s_-]*untrusted[\s_-]*document/gi, '');
  return withoutMarkers.slice(0, MAX_CONVERTED_DOCUMENT_CHARS);
}

export async function workersAiDocumentContent(
  file: { bytes: Uint8Array; mimeType: string; filename: string },
  ai: WorkersAiBinding,
): Promise<string | { dataUrl: string }> {
  if (file.mimeType !== 'application/pdf') return documentContent(file);
  assertPdfWithinPageCap(file.bytes);
  if (!ai.toMarkdown) {
    throw apiError(503, 'EXTRACTION_PROVIDER_UNAVAILABLE', 'Cloudflare Workers AI PDF conversion is unavailable');
  }

  let converted: Awaited<ReturnType<NonNullable<WorkersAiBinding['toMarkdown']>>>;
  try {
    converted = await ai.toMarkdown({
      name: file.filename,
      blob: new Blob([file.bytes], { type: 'application/pdf' }),
    }, { conversionOptions: { pdf: { metadata: false } } });
  } catch (error) {
    workersAiRunError(error);
  }
  const result = Array.isArray(converted) ? converted[0] : converted;
  const text = result?.format !== 'error' && typeof result?.data === 'string'
    ? boundedConvertedText(result.data).trim()
    : '';
  if (!text) {
    throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Cloudflare Workers AI could not read the PDF');
  }
  return text;
}

export function createWorkersAiExtractionProvider(options: {
  ai: WorkersAiBinding;
  model?: string;
}): InvoiceImportExtractionProvider {
  const configuredModel = options.model?.trim();
  const outputInstruction = `Output ONLY a JSON object matching this field list and schema. Do not use Markdown fences or explanatory text: ${JSON.stringify(invoiceProviderResponseJsonSchema)}`;

  return {
    async extractDocument(file, context) {
      const content = await workersAiDocumentContent(file, options.ai);
      const model = configuredModel || (typeof content === 'string' ? DEFAULT_WORKERS_AI_TEXT_MODEL : DEFAULT_WORKERS_AI_MODEL);
      const organisation = extractionContextText(context);
      let retryFeedback = '';

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const retryNote = attempt === 0 ? '' : `\n${RETRY_NOTE}${retryFeedback ? `\nValidation errors: ${retryFeedback}` : ''}`;
        const userContent = typeof content === 'string'
          ? `${organisation}${retryNote}\n${untrustedDocumentText(content)}`
          : [
              { type: 'text', text: `${organisation}${retryNote}` },
              { type: 'image_url', image_url: { url: content.dataUrl } },
            ];
        const messages = [
          { role: 'system', content: `${INVOICE_IMPORT_SYSTEM_PROMPT}\n${outputInstruction}` },
          { role: 'user', content: userContent },
        ];
        const request: Record<string, unknown> = { messages, max_tokens: 3000, temperature: 0 };
        if (typeof content === 'string' && model === DEFAULT_WORKERS_AI_TEXT_MODEL) {
          request.response_format = { type: 'json_schema', json_schema: invoiceProviderResponseJsonSchema };
        }
        let response: unknown;
        try {
          response = await options.ai.run(model, request);
        } catch (error) {
          workersAiRunError(error);
        }
        let parsed: unknown;
        try {
          parsed = parseWorkersAiJson(response);
        } catch {
          retryFeedback = 'response: invalid JSON';
          if (attempt === 1) {
            throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Cloudflare Workers AI returned invalid structured data');
          }
          continue;
        }
        const normalized = normalizeProviderPayload(parsed);
        if (normalized.success) {
          const adjusted = applyExtractionHeuristics(normalized.data, context, {
            lineGstRatesRewritten: normalized.lineGstRatesRewritten,
          });
          return invoiceImportExtractionDraftSchema.parse({ ...adjusted, provider: 'workers-ai', mock: false });
        }
        retryFeedback = normalized.issues.join('; ');
        if (attempt === 1) {
          throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Cloudflare Workers AI returned invalid structured data');
        }
      }
      throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Cloudflare Workers AI returned invalid structured data');
    },
  };
}
