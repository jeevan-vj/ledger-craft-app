import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AssistantProposal } from '@ledgercraft/contracts';
import { apiError } from '../../http-error';
import { computeInvoiceTotals } from '../invoices/totals';

export function pricedTotals(input: {
  taxInclusive: boolean;
  taxRate: string;
  lines: Array<{ description: string; quantity: string; rate: string }>;
}): { subtotal: string; taxAmount: string; total: string } | null {
  if (!input.lines.length) return null;
  const totals = computeInvoiceTotals({
    taxInclusive: input.taxInclusive,
    taxRate: input.taxRate,
    items: input.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      rate: line.rate,
    })),
  }, input.taxRate, 2);
  return { subtotal: totals.subtotal, taxAmount: totals.taxAmount, total: totals.total };
}

export function canonicalProposal(proposal: AssistantProposal): string {
  return JSON.stringify({
    id: proposal.id,
    customerId: proposal.customerId,
    date: proposal.date,
    dueDate: proposal.dueDate,
    taxInclusive: proposal.taxInclusive,
    taxRate: proposal.taxRate,
    currency: proposal.currency,
    notes: proposal.notes,
    lines: proposal.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      rate: line.rate,
      itemId: line.itemId,
    })),
  });
}

function proposalSecret(): string {
  const secret = process.env.ASSISTANT_PROPOSAL_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret) throw apiError(503, 'ASSISTANT_UNAVAILABLE', 'The assistant is not configured.');
  return secret;
}

export function signProposal(organisationId: string, proposal: AssistantProposal): string {
  return createHmac('sha256', proposalSecret()).update(`${organisationId}:${canonicalProposal(proposal)}`).digest('hex');
}

export function proposalSignatureMatches(organisationId: string, proposal: AssistantProposal, signature: string): boolean {
  const expected = Buffer.from(signProposal(organisationId, proposal));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
