import type { InvoiceImportExtractionDraft, InvoiceImportValidationIssue } from '@ledgercraft/contracts';

type Rational = { numerator: bigint; denominator: bigint };

function decimalRational(value: string): Rational {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error('Invalid decimal');
  const fraction = match[2] ?? '';
  return { numerator: BigInt(`${match[1]}${fraction}`), denominator: 10n ** BigInt(fraction.length) };
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function moneyCents(value: string): bigint {
  const parsed = decimalRational(value);
  return roundHalfUp(parsed.numerator * 100n, parsed.denominator);
}

function multiplyMoney(quantity: string, unitPrice: string): bigint {
  const q = decimalRational(quantity);
  const price = decimalRational(unitPrice);
  return roundHalfUp(q.numerator * price.numerator * 100n, q.denominator * price.denominator);
}

function percentageCents(amountCents: bigint, rate: string): bigint {
  const parsed = decimalRational(rate);
  return roundHalfUp(amountCents * parsed.numerator, parsed.denominator * 100n);
}

function centsText(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function mismatch(path: string, expected: bigint, actualText: string, code: 'totals_mismatch' | 'line_amount_mismatch'): InvoiceImportValidationIssue | undefined {
  const actual = moneyCents(actualText);
  if (actual >= expected - 1n && actual <= expected + 1n) return undefined;
  return {
    code, path, message: `${path} differs from the amount recomputed from line items`, blocking: true,
    expected: centsText(expected), actual: actualText,
  };
}

export function recomputeAndValidateDraft(draft: InvoiceImportExtractionDraft): {
  computed: { net: string; gst: string; total: string };
  issues: InvoiceImportValidationIssue[];
} {
  const issues: InvoiceImportValidationIssue[] = [];
  let net = 0n;
  let gst = 0n;
  for (const [index, line] of draft.lineItems.entries()) {
    const lineNet = multiplyMoney(line.quantity, line.unitPrice);
    const lineIssue = mismatch(`lineItems.${index}.amount`, lineNet, line.amount, 'line_amount_mismatch');
    if (lineIssue) issues.push(lineIssue);
    net += lineNet;
    gst += percentageCents(lineNet, line.gstRate);
  }
  const total = net + gst;
  for (const [path, expected, actual] of [
    ['net', net, draft.net], ['gst', gst, draft.gst], ['total', total, draft.total],
  ] as const) {
    const issue = mismatch(path, expected, actual, 'totals_mismatch');
    if (issue) issues.push(issue);
  }
  for (const [path, missing] of [
    ['issuerName', !draft.issuerName], ['documentNumber', !draft.documentNumber],
    ['issueDate', !draft.issueDate], ['lineItems', draft.lineItems.length === 0],
  ] as const) {
    if (missing) issues.push({ code: 'missing_required_field', path, message: `${path} is required before commit`, blocking: true });
  }
  if (draft.issueDate && draft.dueDate && draft.dueDate < draft.issueDate) {
    issues.push({ code: 'invalid_date', path: 'dueDate', message: 'Due date cannot be before issue date', blocking: true });
  }
  return { computed: { net: centsText(net), gst: centsText(gst), total: centsText(total) }, issues };
}

