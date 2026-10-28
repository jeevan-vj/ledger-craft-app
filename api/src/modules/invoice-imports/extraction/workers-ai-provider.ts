import {
  invoiceImportExtractionDraftSchema,
  type InvoiceImportConfidence,
  type InvoiceImportExtractionDraft,
} from '@ledgercraft/contracts';
import { apiError } from '../../../http-error';
import {
  DEFAULT_WORKERS_AI_MODEL,
  DEFAULT_WORKERS_AI_TEXT_MODEL,
  parseWorkersAiJson,
  workersAiRunError,
  type WorkersAiBinding,
} from '../../ai/workers-ai';
import { documentContent } from './document-content';
import {
  INVOICE_IMPORT_SYSTEM_PROMPT,
  invoiceProviderResponseJsonSchema,
  untrustedDocumentText,
} from './invoice-prompt';
import { normalizeProviderPayload } from './provider-output-normalization';
import type { InvoiceImportExtractionProvider } from './types';

const RETRY_NOTE = 'Your previous reply was not valid JSON for the schema. Return only one valid JSON object with every required field.';
const MAX_CONVERTED_DOCUMENT_CHARS = 30_000;

function boundedConvertedText(value: string): string {
  // Strip control characters from provider-produced document text before it reaches the model.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, MAX_CONVERTED_DOCUMENT_CHARS);
}

async function workersAiDocumentContent(
  file: { bytes: Uint8Array; mimeType: string; filename: string },
  ai: WorkersAiBinding,
): Promise<string | { dataUrl: string }> {
  if (file.mimeType !== 'application/pdf') return documentContent(file);
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

function capConfidence(confidence: InvoiceImportConfidence): InvoiceImportConfidence {
  const value = Math.min(confidence.value, 0.6);
  return { value, label: value === 0 ? 'Missing' : 'Check' };
}

function lowerConfidence(draft: Omit<InvoiceImportExtractionDraft, 'provider' | 'mock'>): InvoiceImportExtractionDraft {
  const confidence = draft.confidence;
  return invoiceImportExtractionDraftSchema.parse({
    ...draft,
    provider: 'workers-ai',
    mock: false,
    confidence: {
      issuerName: capConfidence(confidence.issuerName),
      issuerGstNumber: capConfidence(confidence.issuerGstNumber),
      recipientName: capConfidence(confidence.recipientName),
      recipientGstNumber: capConfidence(confidence.recipientGstNumber),
      documentNumber: capConfidence(confidence.documentNumber),
      issueDate: capConfidence(confidence.issueDate),
      dueDate: capConfidence(confidence.dueDate),
      currency: capConfidence(confidence.currency),
      lineItems: confidence.lineItems.map(capConfidence),
      net: capConfidence(confidence.net),
      gst: capConfidence(confidence.gst),
      total: capConfidence(confidence.total),
      suggestedDirection: capConfidence(confidence.suggestedDirection),
      thirdPartyIssued: capConfidence(confidence.thirdPartyIssued),
    },
  });
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
      const organisation = `Organisation: ${context.organisationName.slice(0, 200)}${context.gstNumber ? `; GST: ${context.gstNumber.slice(0, 40)}` : ''}`;
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
        if (normalized.success) return lowerConfidence(normalized.data);
        retryFeedback = normalized.issues.join('; ');
        if (attempt === 1) {
          throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Cloudflare Workers AI returned invalid structured data');
        }
      }
      throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Cloudflare Workers AI returned invalid structured data');
    },
  };
}
