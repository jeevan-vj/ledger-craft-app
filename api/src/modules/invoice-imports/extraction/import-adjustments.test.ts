import { describe, expect, it, vi } from 'vitest';
import { recomputeAndValidateDraft } from '../draft-validation';
import { INVOICE_IMPORT_SYSTEM_PROMPT } from './invoice-prompt';
import { normalizeProviderPayload } from './provider-output-normalization';
import { createRemoteExtractionProvider } from './remote-provider';
import { createWorkersAiExtractionProvider } from './workers-ai-provider';

const file = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: 'image/jpeg',
  filename: 'synthetic-receipt.jpg',
  sha256: 'ab'.repeat(32),
};

function confidence(value: number) {
  return { value, label: value === 0 ? 'Missing' as const : value >= 0.85 ? 'High' as const : 'Check' as const };
}

function uniformConfidence(value: number) {
  const field = confidence(value);
  const missing = confidence(0);
  return {
    issuerName: field, issuerGstNumber: field, recipientName: field, recipientGstNumber: missing,
    documentNumber: field, issueDate: field, dueDate: missing, currency: field, lineItems: [field],
    net: field, gst: field, total: field, suggestedDirection: field, thirdPartyIssued: field,
  };
}

/** Synthetic stand-in for the paid NZ receipt: 1 × 56.52, GST dollars 8.48, total 65.00. */
function radiologyModelPayload(overrides: Record<string, unknown> = {}) {
  return {
    issuerName: 'Northside Imaging',
    issuerGstNumber: 'GST # 050-634-531',
    recipientName: 'Alex Carter',
    recipientGstNumber: null,
    documentNumber: '1329291',
    issueDate: '2026-10-13',
    dueDate: null,
    currency: 'NZD',
    lineItems: [{ description: 'Service', quantity: '1', unitPrice: '56.52', amount: '56.52', gstRate: '8.48' }],
    net: '56.52',
    gst: '8.48',
    total: '65.00',
    suggestedDirection: 'SALES',
    suggestedDirectionReason: 'The model treated the recipient as a customer.',
    thirdPartyIssued: false,
    confidence: uniformConfidence(0.6),
    ...overrides,
  };
}

const orgContext = { organisationName: "Alex Carter's organisation", userName: 'Alex Carter' };

describe('invoice import extraction adjustments', () => {
  it('resolves a line GST amount of 8.48 on a 56.52 net to 15% so the receipt validates', () => {
    const normalized = normalizeProviderPayload(radiologyModelPayload());
    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    expect(normalized.data.lineItems[0]?.gstRate).toBe('15');
    expect(normalized.data.issuerGstNumber).toBe('050-634-531');
    const draft = { ...normalized.data, provider: 'workers-ai' as const, mock: false };
    expect(recomputeAndValidateDraft(draft).issues.filter((issue) => issue.code === 'totals_mismatch' || issue.code === 'line_amount_mismatch')).toEqual([]);
    expect(recomputeAndValidateDraft(draft).computed).toEqual({ net: '56.52', gst: '8.48', total: '65.00' });
  });

  it('keeps a reconciling 10% rate and an already-correct 15% rate', () => {
    const ten = normalizeProviderPayload(radiologyModelPayload({
      lineItems: [{ description: 'Service', quantity: '1', unitPrice: '100.00', amount: '100.00', gstRate: '10' }],
      net: '100.00', gst: '10.00', total: '110.00',
    }));
    const fifteen = normalizeProviderPayload(radiologyModelPayload({
      lineItems: [{ description: 'Service', quantity: '1', unitPrice: '56.52', amount: '56.52', gstRate: '15' }],
    }));
    expect(ten.success && ten.data.lineItems[0]?.gstRate).toBe('10');
    expect(fifteen.success && fifteen.data.lineItems[0]?.gstRate).toBe('15');
  });

  it('lifts a labelled GST registration number out of the issuer name', () => {
    const normalized = normalizeProviderPayload(radiologyModelPayload({
      issuerName: 'Northside Imaging GST # 050-634-531',
      issuerGstNumber: null,
    }));
    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    expect(normalized.data.issuerGstNumber).toBe('050-634-531');
    expect(normalized.data.issuerName).toBe('Northside Imaging');
  });

  it('suggests PURCHASE when the recipient is the organisation or user and the issuer is another business', async () => {
    const run = vi.fn(async (_model: string, _request: unknown) => ({ response: radiologyModelPayload() }));
    const provider = createWorkersAiExtractionProvider({ ai: { run } });
    const draft = await provider.extractDocument(file, orgContext);
    expect(draft.suggestedDirection).toBe('PURCHASE');
    expect(draft.lineItems[0]?.gstRate).toBe('15');
    expect(draft.issuerGstNumber).toBe('050-634-531');
    expect(recomputeAndValidateDraft(draft).computed).toEqual({ net: '56.52', gst: '8.48', total: '65.00' });
    expect(JSON.stringify(run.mock.calls[0]?.[1])).toContain('User: Alex Carter');
    const positive = [
      draft.confidence.issuerName.value,
      draft.confidence.documentNumber.value,
      draft.confidence.total.value,
      draft.confidence.lineItems[0]?.value ?? 0,
    ].filter((value) => value > 0);
    expect(new Set(positive).size).toBeGreaterThan(1);
    expect(positive.every((value) => value === 0.6)).toBe(false);
    expect(draft.confidence.lineItems[0]).toEqual({ value: 0.7, label: 'Check' });
    expect(draft.confidence.dueDate).toEqual({ value: 0, label: 'Missing' });
  });

  it('keeps a buyer-created tax invoice as SALES and preserves varied provider confidence', async () => {
    const payload = radiologyModelPayload({
      issuerName: 'Cleancorp Ltd',
      recipientName: 'Alex Carter',
      suggestedDirection: 'SALES',
      thirdPartyIssued: true,
      lineItems: [{ description: 'Service', quantity: '1', unitPrice: '56.52', amount: '56.52', gstRate: '15' }],
      confidence: {
        ...uniformConfidence(0.42),
        issuerName: confidence(0.91),
        total: confidence(0.97),
        lineItems: [confidence(0.96)],
      },
    });
    const provider = createWorkersAiExtractionProvider({ ai: { run: async () => ({ response: payload }) } });
    const draft = await provider.extractDocument(file, orgContext);
    expect(draft.suggestedDirection).toBe('SALES');
    expect(draft.thirdPartyIssued).toBe(true);
    expect(draft.confidence.issuerName).toEqual({ value: 0.91, label: 'High' });
    expect(draft.confidence.total).toEqual({ value: 0.97, label: 'High' });
    expect(draft.confidence.lineItems[0]).toEqual({ value: 0.96, label: 'High' });
  });

  it('asks the model for a GST percentage and a registration number, not a dollar rate', () => {
    expect(INVOICE_IMPORT_SYSTEM_PROMPT).toContain('gstRate is a tax percentage');
    expect(INVOICE_IMPORT_SYSTEM_PROMPT).toContain('issuerGstNumber');
    expect(INVOICE_IMPORT_SYSTEM_PROMPT).not.toContain('050-634-531');
  });

  it('applies the same GST and direction adjustments to a remote provider payload', async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      choices: [{ message: { content: JSON.stringify(radiologyModelPayload()) } }],
    }));
    const provider = createRemoteExtractionProvider({
      provider: 'openai', apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch,
    });
    const draft = await provider.extractDocument(file, orgContext);
    expect(draft.provider).toBe('openai');
    expect(draft.lineItems[0]?.gstRate).toBe('15');
    expect(draft.suggestedDirection).toBe('PURCHASE');
    expect(draft.issuerGstNumber).toBe('050-634-531');
  });
});
