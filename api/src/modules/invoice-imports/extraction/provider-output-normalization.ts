import type { z } from 'zod';
import { providerPayloadSchema } from './invoice-prompt';

type ProviderPayload = z.infer<typeof providerPayloadSchema>;

type NormalizationResult =
  | { success: true; data: ProviderPayload }
  | { success: false; issues: string[] };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeNullableText(value: unknown): unknown {
  if (value === null) return null;
  return typeof value === 'string' ? value.trim() || null : value;
}

function normalizeDecimal(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? String(value) : value;
  }
  if (typeof value !== 'string') return value;

  let candidate = value.trim();
  candidate = candidate.replace(/^(?:[A-Z]{3}\s+|NZ\$\s*|[$€£]\s*)/i, '');
  candidate = candidate.replace(/(?:\s+[A-Z]{3}|\s*%)$/i, '');
  candidate = candidate.trim();
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(candidate)) {
    candidate = candidate.replace(/,/g, '');
  }
  return candidate;
}

const MONTHS: Record<string, string> = {
  jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
  apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
  aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10',
  october: '10', nov: '11', november: '11', dec: '12', december: '12',
};

function normalizeDate(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{1,2})\s+([A-Za-z]+)\s*,?\s*(\d{4})$/.exec(trimmed);
  if (!match) return trimmed;
  const month = MONTHS[match[2].toLowerCase()];
  const day = Number(match[1]);
  if (!month || day < 1 || day > 31) return trimmed;
  return `${match[3]}-${month}-${String(day).padStart(2, '0')}`;
}

function normalizeConfidence(value: unknown): unknown {
  const source = record(value);
  if (!source) return value;
  const parsed = typeof source.value === 'string' && source.value.trim() !== ''
    ? Number(source.value)
    : source.value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return value;
  const confidence = Math.min(1, Math.max(0, parsed));
  return {
    value: confidence,
    label: confidence === 0 ? 'Missing' : confidence >= 0.85 ? 'High' : 'Check',
  };
}

function normalizeLineItem(value: unknown): unknown {
  const source = record(value);
  if (!source) return value;
  return {
    ...source,
    description: typeof source.description === 'string' ? source.description.trim() : source.description,
    quantity: normalizeDecimal(source.quantity),
    unitPrice: normalizeDecimal(source.unitPrice),
    amount: normalizeDecimal(source.amount),
    gstRate: normalizeDecimal(source.gstRate),
  };
}

export function normalizeProviderPayload(value: unknown): NormalizationResult {
  const source = record(value);
  if (!source) return { success: false, issues: ['response: Expected an object'] };
  const confidence = record(source.confidence);
  const normalizedConfidence = confidence ? Object.fromEntries(
    Object.entries(confidence).map(([key, entry]) => [
      key,
      key === 'lineItems' && Array.isArray(entry)
        ? entry.map(normalizeConfidence)
        : normalizeConfidence(entry),
    ]),
  ) : source.confidence;

  const normalized = {
    ...source,
    issuerName: normalizeNullableText(source.issuerName),
    issuerGstNumber: normalizeNullableText(source.issuerGstNumber),
    recipientName: normalizeNullableText(source.recipientName),
    recipientGstNumber: normalizeNullableText(source.recipientGstNumber),
    documentNumber: normalizeNullableText(source.documentNumber),
    issueDate: normalizeDate(source.issueDate),
    dueDate: normalizeDate(source.dueDate),
    currency: typeof source.currency === 'string' ? source.currency.trim().toUpperCase() : source.currency,
    lineItems: Array.isArray(source.lineItems) ? source.lineItems.map(normalizeLineItem) : source.lineItems,
    net: normalizeDecimal(source.net),
    gst: normalizeDecimal(source.gst),
    total: normalizeDecimal(source.total),
    suggestedDirection: typeof source.suggestedDirection === 'string'
      ? source.suggestedDirection.trim().toUpperCase()
      : source.suggestedDirection,
    suggestedDirectionReason: typeof source.suggestedDirectionReason === 'string'
      ? source.suggestedDirectionReason.trim()
      : source.suggestedDirectionReason,
    thirdPartyIssued: source.thirdPartyIssued === 'true'
      ? true
      : source.thirdPartyIssued === 'false' ? false : source.thirdPartyIssued,
    confidence: normalizedConfidence,
  };
  const result = providerPayloadSchema.safeParse(normalized);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    issues: result.error.issues.slice(0, 8).map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`),
  };
}
