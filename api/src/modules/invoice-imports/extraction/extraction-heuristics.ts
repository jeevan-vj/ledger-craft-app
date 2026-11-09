import type { InvoiceImportConfidence, InvoiceImportExtractionDraft } from '@ledgercraft/contracts';
import { recomputeAndValidateDraft } from '../draft-validation';
import type { ExtractionContext } from './types';

type Draft = Omit<InvoiceImportExtractionDraft, 'provider' | 'mock'>;

const STOP_WORDS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'ltd', 'limited', 'pty', 'nz', 'the', 'and', 'of',
  'organisation', 'organization', 'org', 'group', 'company', 'co', 'inc',
]);

function labelled(value: number): InvoiceImportConfidence {
  const clamped = Math.min(1, Math.max(0, value));
  return { value: clamped, label: clamped === 0 ? 'Missing' : clamped >= 0.85 ? 'High' : 'Check' };
}

function partyTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/['’]s\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function matchesParty(name: string | null, parties: string[]): boolean {
  if (!name) return false;
  const tokens = new Set(partyTokens(name));
  return parties.some((party) => {
    const expected = partyTokens(party);
    if (expected.length === 0) return false;
    return expected.every((token) => tokens.has(token));
  });
}

function applyDirection(draft: Draft, context: ExtractionContext): { draft: Draft; changed: boolean } {
  if (draft.thirdPartyIssued) {
    if (draft.suggestedDirection === 'SALES') return { draft, changed: false };
    return {
      changed: true,
      draft: {
        ...draft,
        suggestedDirection: 'SALES',
        suggestedDirectionReason: 'Buyer-created tax invoice. Suggested sales.',
      },
    };
  }
  const parties = [context.organisationName, context.userName ?? ''].filter((value) => value.trim().length > 0);
  const recipientMatches = matchesParty(draft.recipientName, parties);
  const issuerIsDifferent = Boolean(draft.issuerName) && !matchesParty(draft.issuerName, parties);
  if (!recipientMatches || !issuerIsDifferent || draft.suggestedDirection === 'PURCHASE') {
    return { draft, changed: false };
  }
  return {
    changed: true,
    draft: {
      ...draft,
      suggestedDirection: 'PURCHASE',
      suggestedDirectionReason: 'The recipient matches the organisation or user, and the issuer is a different business.',
    },
  };
}

function positiveConfidences(confidence: Draft['confidence']): number[] {
  const scalars = [
    confidence.issuerName, confidence.issuerGstNumber, confidence.recipientName, confidence.recipientGstNumber,
    confidence.documentNumber, confidence.issueDate, confidence.dueDate, confidence.currency, confidence.net,
    confidence.gst, confidence.total, confidence.suggestedDirection, confidence.thirdPartyIssued,
  ].map((entry) => entry.value);
  return [...scalars, ...confidence.lineItems.map((entry) => entry.value)].filter((value) => value > 0);
}

function uniformPlaceholder(confidence: Draft['confidence']): boolean {
  const values = positiveConfidences(confidence);
  return values.length >= 2 && values.every((value) => value === values[0]);
}

function nzGstNumber(value: string | null): boolean {
  return value != null && /^\d{2,3}-\d{3}-\d{3}$/.test(value);
}

function totalsReconcile(draft: Draft): boolean {
  const { issues } = recomputeAndValidateDraft({ ...draft, provider: 'mock', mock: true });
  return !issues.some((issue) => issue.code === 'totals_mismatch' || issue.code === 'line_amount_mismatch');
}

function heuristicConfidence(draft: Draft, rewritten: boolean[], directionChanged: boolean): Draft['confidence'] {
  const money = totalsReconcile(draft);
  const present = (value: string | null, score: number) => labelled(value ? score : 0);
  return {
    issuerName: present(draft.issuerName, 0.9),
    issuerGstNumber: labelled(draft.issuerGstNumber ? (nzGstNumber(draft.issuerGstNumber) ? 0.93 : 0.64) : 0),
    recipientName: present(draft.recipientName, 0.88),
    recipientGstNumber: labelled(draft.recipientGstNumber ? (nzGstNumber(draft.recipientGstNumber) ? 0.91 : 0.62) : 0),
    documentNumber: present(draft.documentNumber, 0.89),
    issueDate: present(draft.issueDate, 0.94),
    dueDate: present(draft.dueDate, 0.86),
    currency: labelled(draft.currency === 'NZD' ? 0.97 : 0.8),
    lineItems: draft.lineItems.map((_, index) => labelled(rewritten[index] ? 0.7 : 0.9)),
    net: labelled(money ? 0.92 : 0.5),
    gst: labelled(money ? 0.95 : 0.48),
    total: labelled(money ? 0.96 : 0.46),
    suggestedDirection: labelled(draft.suggestedDirection ? (directionChanged ? 0.7 : 0.87) : 0),
    thirdPartyIssued: labelled(0.84),
  };
}

function withMeasuredConfidence(draft: Draft, rewritten: boolean[], directionChanged: boolean): Draft['confidence'] {
  const confidence = draft.confidence;
  const missing = labelled(0);
  return {
    ...confidence,
    issuerName: draft.issuerName ? confidence.issuerName : missing,
    issuerGstNumber: draft.issuerGstNumber ? confidence.issuerGstNumber : missing,
    recipientName: draft.recipientName ? confidence.recipientName : missing,
    recipientGstNumber: draft.recipientGstNumber ? confidence.recipientGstNumber : missing,
    documentNumber: draft.documentNumber ? confidence.documentNumber : missing,
    issueDate: draft.issueDate ? confidence.issueDate : missing,
    dueDate: draft.dueDate ? confidence.dueDate : missing,
    lineItems: draft.lineItems.map((_, index) => rewritten[index] ? labelled(0.7) : (confidence.lineItems[index] ?? labelled(0.7))),
    suggestedDirection: directionChanged ? labelled(0.7) : confidence.suggestedDirection,
  };
}

export function applyExtractionHeuristics(
  draft: Draft,
  context: ExtractionContext,
  options: { lineGstRatesRewritten?: boolean[] } = {},
): Draft {
  const rewritten = draft.lineItems.map((_, index) => options.lineGstRatesRewritten?.[index] === true);
  const directed = applyDirection(draft, context);
  const measured = directed.draft.confidence;
  return {
    ...directed.draft,
    confidence: uniformPlaceholder(measured)
      ? heuristicConfidence(directed.draft, rewritten, directed.changed)
      : withMeasuredConfidence(directed.draft, rewritten, directed.changed),
  };
}
