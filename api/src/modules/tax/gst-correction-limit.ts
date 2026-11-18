import { decimal, roundMoney } from '../invoices/money';

/** IRD lets a later GST return include a mistake of $1,000 or less. */
export const GST_CORRECTION_SAFE_HARBOUR = '1000.00';
/** Above $1,000, the later return can include no more than this cap. */
export const GST_CORRECTION_CAP = '10000.00';

export const GST_CORRECTION_AMEND_GUIDANCE =
  'This net GST discrepancy is over the amount IRD lets you correct in a later return ($1,000, or the lower of $10,000 and 2% of the output tax on the return it would be included in). Amend the original return in myIR instead of carrying it forward.';

export const GST_CORRECTION_UNRESOLVED_MESSAGE =
  'Filing is blocked while a prior-period correction over the IRD carry-forward limit is unresolved. Review it and amend the original return in myIR. Recording that amendment here removes it from this return.';

/**
 * Largest net GST discrepancy that can be carried into a return with this output tax.
 * Output tax is the including return's signed ledger GST on sales, before this correction.
 * 2% is rounded to cents with roundMoney, then capped at $10,000.
 * A negative or zero output tax does not raise the ceiling: the $1,000 safe harbour remains.
 */
export function gstCorrectionCarryLimit(outputTax: string): string {
  const twoPercent = roundMoney(decimal(outputTax).mul('0.02'));
  const capped = decimal(twoPercent).compare(GST_CORRECTION_CAP) > 0 ? decimal(GST_CORRECTION_CAP) : decimal(twoPercent);
  const safe = decimal(GST_CORRECTION_SAFE_HARBOUR);
  return roundMoney(safe.compare(capped) >= 0 ? safe : capped);
}

/** True when the absolute net discrepancy is within the carry-forward limit, including the exact boundary. */
export function gstCorrectionWithinLimit(netDiscrepancy: string, outputTax: string): boolean {
  const net = roundMoney(decimal(netDiscrepancy).abs());
  return decimal(net).compare(gstCorrectionCarryLimit(outputTax)) <= 0;
}

/** Absolute effect on GST payable. Output increases payable; input decreases it. */
export function netGstDiscrepancy(rows: Array<{ kind: 'output' | 'input'; amount: string }>): string {
  const net = rows.reduce((sum, row) => (row.kind === 'output' ? sum.add(row.amount) : sum.sub(row.amount)), decimal(0));
  return roundMoney(net.abs());
}

type CorrectionIdentity = { id: string; originalTaxReturnId: string; kind: 'output' | 'input'; amount: string };

export type GstCorrectionAssessment = {
  status: 'pending' | 'over_limit';
  carryForward: 'included' | 'refused';
  netDiscrepancy: string;
  limit: string;
  guidance?: string;
};

/**
 * One ceiling for every correction carried into the same return.
 * Rows are considered in the order given. A row that would push the combined
 * net over the limit is refused on its own. Earlier rows that still fit stay included.
 */
export function assessGstCorrections<T extends CorrectionIdentity>(
  rows: T[],
  outputTax: string,
  alreadyIncluded: Array<{ kind: 'output' | 'input'; amount: string }> = [],
): {
  limit: string;
  included: Array<T & { assessment: GstCorrectionAssessment }>;
  refused: Array<T & { assessment: GstCorrectionAssessment }>;
  blocked: boolean;
  rows: Array<T & { assessment: GstCorrectionAssessment }>;
} {
  const limit = gstCorrectionCarryLimit(outputTax);
  const accepted: Array<{ kind: 'output' | 'input'; amount: string }> = alreadyIncluded.map((row) => ({ kind: row.kind, amount: row.amount }));
  const annotated = rows.map((row) => {
    const net = netGstDiscrepancy([...accepted, row]);
    const refused = !gstCorrectionWithinLimit(net, outputTax);
    if (!refused) accepted.push({ kind: row.kind, amount: row.amount });
    const assessment: GstCorrectionAssessment = {
      status: refused ? 'over_limit' : 'pending',
      carryForward: refused ? 'refused' : 'included',
      netDiscrepancy: net,
      limit,
      ...(refused ? { guidance: GST_CORRECTION_AMEND_GUIDANCE } : {}),
    };
    return { ...row, assessment };
  });
  const combined = netGstDiscrepancy(accepted);
  for (const row of annotated) {
    if (row.assessment.carryForward === 'included') row.assessment.netDiscrepancy = combined;
  }
  const refused = annotated.filter((row) => row.assessment.carryForward === 'refused');
  return {
    limit,
    included: annotated.filter((row) => row.assessment.carryForward === 'included'),
    refused,
    blocked: refused.length > 0,
    rows: annotated,
  };
}
