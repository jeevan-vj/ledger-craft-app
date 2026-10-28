import {
  invoiceImportExtractionDraftSchema,
  type InvoiceImportConfidence,
  type InvoiceImportExtractionDraft,
} from '@ledgercraft/contracts';
import { apiError } from '../../../http-error';
import {
  DEFAULT_WORKERS_AI_MODEL,
  parseWorkersAiJson,
  workersAiRunError,
  type WorkersAiBinding,
} from '../../ai/workers-ai';
import { assertPdfWithinPageCap } from '../invoice-import-validation';
import { documentContent } from './document-content';
import {
  INVOICE_IMPORT_SYSTEM_PROMPT,
  invoiceProviderResponseJsonSchema,
  providerPayloadSchema,
  untrustedDocumentText,
} from './invoice-prompt';
import type { InvoiceImportExtractionProvider } from './types';

const RETRY_NOTE = 'Your previous reply was not valid JSON for the schema. Return only one valid JSON object with every required field.';
const MAX_CONVERTED_DOCUMENT_CHARS = 30_000;

function boundedConvertedText(value: string): string {
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

async function workersAiDocumentContent(
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
  const model = options.model?.trim() || DEFAULT_WORKERS_AI_MODEL;
  const outputInstruction = `Output ONLY a JSON object matching this field list and schema. Do not use Markdown fences or explanatory text: ${JSON.stringify(invoiceProviderResponseJsonSchema)}`;

  return {
    async extractDocument(file, context) {
      const content = await workersAiDocumentContent(file, options.ai);
      const organisation = `Organisation: ${context.organisationName.slice(0, 200)}${context.gstNumber ? `; GST: ${context.gstNumber.slice(0, 40)}` : ''}`;
      const documentPart = typeof content === 'string'
        ? { type: 'text', text: untrustedDocumentText(content) }
        : { type: 'image_url', image_url: { url: content.dataUrl } };

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const messages = [
          { role: 'system', content: `${INVOICE_IMPORT_SYSTEM_PROMPT}\n${outputInstruction}` },
          { role: 'user', content: [
            { type: 'text', text: attempt === 0 ? organisation : `${organisation}\n${RETRY_NOTE}` },
            documentPart,
          ] },
        ];
        let response: unknown;
        try {
          response = await options.ai.run(model, { messages, max_tokens: 3000, temperature: 0 });
        } catch (error) {
          workersAiRunError(error);
        }
        try {
          const payload = providerPayloadSchema.parse(parseWorkersAiJson(response));
          return lowerConfidence(payload);
        } catch {
          if (attempt === 1) {
            throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Cloudflare Workers AI returned invalid structured data');
          }
        }
      }
      throw apiError(502, 'EXTRACTION_PROVIDER_ERROR', 'Cloudflare Workers AI returned invalid structured data');
    },
  };
}
