import type { GstAdjustment, GstPeriodCorrection, GstPriorPeriodCorrectionDisclosure } from '@ledgercraft/contracts';
import type { Database } from '../../db/client';
import { decimal, roundMoney } from '../invoices/money';
import { assessGstCorrections, GST_CORRECTION_AMEND_GUIDANCE } from './gst-correction-limit';
import { inForceFiledReturns, listCorrectionsForTarget, type GstCorrectionRow } from './gst-correction.repository';

export type PriorPeriodCarry = {
  output: string;
  input: string;
  adjustments: GstAdjustment[];
  disclosure: GstPriorPeriodCorrectionDisclosure[];
  review: GstPeriodCorrection[];
  blocked: boolean;
};

export const emptyPriorPeriodCarry: PriorPeriodCarry = { output: '0.00', input: '0.00', adjustments: [], disclosure: [], review: [], blocked: false };

function disclosureOf(row: GstCorrectionRow): GstPriorPeriodCorrectionDisclosure {
  return {
    id: row.id, originalTaxReturnId: row.originalTaxReturnId, originalPeriodStart: row.originalPeriodStart, originalPeriodEnd: row.originalPeriodEnd,
    sourceType: row.sourceType as GstPriorPeriodCorrectionDisclosure['sourceType'], sourceId: row.sourceId,
    action: row.action as GstPriorPeriodCorrectionDisclosure['action'], kind: row.kind as 'output' | 'input', amount: row.amount, reason: row.reason,
  };
}

function reviewOf(row: GstCorrectionRow, extra: Pick<GstPeriodCorrection, 'status' | 'carryForward' | 'netDiscrepancy' | 'limit' | 'guidance'>): GstPeriodCorrection {
  return {
    ...disclosureOf(row), targetPeriodStart: row.targetPeriodStart, targetPeriodEnd: row.targetPeriodEnd,
    resolution: row.resolution === 'amend_in_myir' ? 'amend_in_myir' : null, createdAt: row.createdAt.toISOString(), ...extra,
  };
}

/** Pending corrections are tested against this period's output tax. Already included rows stay on this period. */
export async function priorPeriodCarry(tx: Database, organisationId: string, from: string, to: string, outputTax: string): Promise<PriorPeriodCarry> {
  const rows = await listCorrectionsForTarget(tx, organisationId, from, to);
  if (!rows.length) return emptyPriorPeriodCarry;
  const inForce = new Set((await inForceFiledReturns(tx, organisationId)).map((row) => row.id));
  const narrow = (row: GstCorrectionRow) => ({ ...row, kind: row.kind as 'output' | 'input' });
  const pending = rows.filter((row) => row.status === 'pending' && inForce.has(row.originalTaxReturnId)).map(narrow);
  const included = rows.filter((row) => row.status === 'included').map(narrow);
  const assessed = assessGstCorrections(pending, outputTax, included);
  const inBoxes = [...assessed.included, ...included];
  const output = roundMoney(inBoxes.filter((row) => row.kind === 'output').reduce((sum, row) => sum.add(row.amount), decimal(0)));
  const input = roundMoney(inBoxes.filter((row) => row.kind === 'input').reduce((sum, row) => sum.add(row.amount), decimal(0)));
  const adjustments: GstAdjustment[] = inBoxes.map((row) => ({ kind: row.kind as 'output' | 'input', type: 'prior_period_correction', amount: row.amount, reason: row.reason, sourceReference: row.sourceId }));
  const disclosure = inBoxes.map(disclosureOf).sort((a, b) => a.id.localeCompare(b.id));
  const review = [
    ...assessed.rows.map((row) => reviewOf(row, { ...row.assessment, guidance: row.assessment.guidance })),
    ...included.map((row) => reviewOf(row, { status: 'included', carryForward: 'included', netDiscrepancy: '0.00', limit: assessed.limit })),
    ...rows.filter((row) => row.status === 'resolved').map((row) => reviewOf(row, {
      status: 'resolved', carryForward: 'not_applicable', netDiscrepancy: '0.00', limit: assessed.limit, guidance: GST_CORRECTION_AMEND_GUIDANCE,
    })),
  ].sort((a, b) => a.id.localeCompare(b.id));
  return { output, input, adjustments, disclosure, review, blocked: assessed.blocked };
}
