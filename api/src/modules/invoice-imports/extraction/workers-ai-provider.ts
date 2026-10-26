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
import { documentContent } from './document-content';
import {
  INVOICE_IMPORT_SYSTEM_PROMPT,
  invoiceProviderResponseJsonSchema,
  providerPayloadSchema,
  untrustedDocumentText,
} from './invoice-prompt';
import type { InvoiceImportExtractionProvider } from './types';

const UNSUPPORTED_PDF_MESSAGE = 'Cloudflare Workers AI can only read images (PNG/JPEG/WebP). Upload a photo or screenshot of the PDF, or configure OpenAI/xAI for PDFs.';
const RETRY_NOTE = 'Your previous reply was not valid JSON for the schema. Return only one valid JSON object with every required field.';

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
      if (file.mimeType === 'application/pdf') {
        throw apiError(415, 'EXTRACTION_UNSUPPORTED_DOCUMENT', UNSUPPORTED_PDF_MESSAGE);
      }
      const content = documentContent(file);
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
