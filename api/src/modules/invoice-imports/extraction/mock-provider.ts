import { invoiceImportExtractionDraftSchema, type InvoiceImportConfidence, type InvoiceImportExtractionDraft } from '@ledgercraft/contracts';
import type { InvoiceImportExtractionProvider } from './types';

const HASHES = {
  cleancorp: '0012ba30001b8107aa835a607991ae6b535c7b636d1f3a538dad26843cbdb4f2',
  photo: '2d6fea12cf8376c0688aa12919e59f1ca7b25e01a05a7db78b094aadeae101bd',
  injection: 'd93821702c02dba9ba431c5c75e0a5096eb70b3a9a967bc91640092ca9936d33',
  supplier: 'bbae5416bd40c96b50c01f8202719231597b211556da51510f3d4a156f168aa1',
} as const;

function confidence(value: number): InvoiceImportConfidence {
  return { value, label: value === 0 ? 'Missing' : value >= 0.85 ? 'High' : 'Check' };
}

function confidences(values: Partial<Record<string, number>>, lineValues: number[]) {
  const value = (key: string) => confidence(values[key] ?? 0.95);
  return {
    issuerName: value('issuerName'), issuerGstNumber: value('issuerGstNumber'),
    recipientName: value('recipientName'), recipientGstNumber: value('recipientGstNumber'),
    documentNumber: value('documentNumber'), issueDate: value('issueDate'), dueDate: value('dueDate'),
    currency: value('currency'), lineItems: lineValues.map(confidence), net: value('net'), gst: value('gst'),
    total: value('total'), suggestedDirection: value('suggestedDirection'), thirdPartyIssued: value('thirdPartyIssued'),
  };
}

function draft(input: Omit<InvoiceImportExtractionDraft, 'provider' | 'mock'>): InvoiceImportExtractionDraft {
  return invoiceImportExtractionDraftSchema.parse({ ...input, provider: 'mock', mock: true });
}

const known: Record<string, InvoiceImportExtractionDraft> = {
  cleancorp: draft({
    issuerName: 'Cleancorp Ltd', issuerGstNumber: '123-456-789', recipientName: 'Crystal Touch Cleaning',
    recipientGstNumber: null, documentNumber: 'CC-TEST-001', issueDate: '2026-10-20', dueDate: '2026-11-20',
    currency: 'NZD', lineItems: [{ description: 'Cleaning services', quantity: '1', unitPrice: '200.00', amount: '200.00', gstRate: '15.00' }],
    net: '200.00', gst: '30.00', total: '230.00', suggestedDirection: 'SALES',
    suggestedDirectionReason: 'Buyer-created tax invoice issued by Cleancorp Ltd to the organisation.', thirdPartyIssued: true,
    confidence: confidences({ dueDate: 0.4, recipientGstNumber: 0 }, [0.96]),
  }),
  supplier: draft({
    issuerName: 'Sparkle Supplies Ltd', issuerGstNumber: '987-654-321', recipientName: 'Crystal Touch Cleaning',
    recipientGstNumber: null, documentNumber: 'SS-TEST-001', issueDate: '2026-10-21', dueDate: '2026-11-20',
    currency: 'NZD', lineItems: [{ description: 'Cleaning supplies', quantity: '1', unitPrice: '100.00', amount: '100.00', gstRate: '15.00' }],
    net: '100.00', gst: '15.00', total: '115.00', suggestedDirection: 'PURCHASE',
    suggestedDirectionReason: 'Supplier invoice addressed to the organisation.', thirdPartyIssued: false,
    confidence: confidences({ recipientGstNumber: 0 }, [0.96]),
  }),
  photo: draft({
    issuerName: 'Corner Dairy', issuerGstNumber: null, recipientName: null, recipientGstNumber: null,
    documentNumber: 'R-1042', issueDate: '2026-10-22', dueDate: null, currency: 'NZD',
    lineItems: [{ description: 'Cleaning cloths', quantity: '2', unitPrice: '10.00', amount: '20.00', gstRate: '15.00' }],
    net: '20.00', gst: '3.00', total: '23.00', suggestedDirection: 'PURCHASE',
    suggestedDirectionReason: 'Photo appears to be a small supplier receipt.', thirdPartyIssued: false,
    confidence: confidences({ issuerName: 0.72, issuerGstNumber: 0, recipientName: 0, recipientGstNumber: 0, documentNumber: 0.65, issueDate: 0.7, dueDate: 0, currency: 0.8, net: 0.72, gst: 0.68, total: 0.8, suggestedDirection: 0.75, thirdPartyIssued: 0.7 }, [0.7]),
  }),
  injection: draft({
    issuerName: 'Malicious Supplier Test Document', issuerGstNumber: null, recipientName: 'Crystal Touch Cleaning', recipientGstNumber: null,
    documentNumber: 'INJECT-TEST-001', issueDate: '2026-10-23', dueDate: null, currency: 'NZD',
    lineItems: [{ description: 'Service', quantity: '1', unitPrice: '100.00', amount: '100.00', gstRate: '15.00' }],
    net: '100.00', gst: '15.00', total: '0.00', suggestedDirection: 'PURCHASE',
    suggestedDirectionReason: 'Supplier document addressed to the organisation.', thirdPartyIssued: false,
    confidence: confidences({ issuerGstNumber: 0, recipientGstNumber: 0, dueDate: 0 }, [0.92]),
  }),
};

function generic(): InvoiceImportExtractionDraft {
  const missing = confidence(0);
  return draft({
    issuerName: null, issuerGstNumber: null, recipientName: null, recipientGstNumber: null,
    documentNumber: null, issueDate: null, dueDate: null, currency: 'NZD', lineItems: [],
    net: '0.00', gst: '0.00', total: '0.00', suggestedDirection: null,
    suggestedDirectionReason: 'The mock provider has no deterministic result for this document.', thirdPartyIssued: false,
    confidence: {
      issuerName: missing, issuerGstNumber: missing, recipientName: missing, recipientGstNumber: missing,
      documentNumber: missing, issueDate: missing, dueDate: missing, currency: confidence(0.5), lineItems: [],
      net: missing, gst: missing, total: missing, suggestedDirection: missing, thirdPartyIssued: missing,
    },
  });
}

export function createMockExtractionProvider(): InvoiceImportExtractionProvider {
  return {
    async extractDocument(file) {
      const hashMatch = Object.entries(HASHES).find(([, hash]) => hash === file.sha256)?.[0];
      const filenameMatch = file.filename.includes('cleancorp') ? 'cleancorp'
        : file.filename.includes('sparkle') ? 'supplier'
          : file.filename.includes('injection') ? 'injection'
            : file.filename.includes('photo') ? 'photo' : undefined;
      return known[hashMatch ?? filenameMatch ?? ''] ?? generic();
    },
  };
}

