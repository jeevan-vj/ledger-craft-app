import { moneyCents, multiplyMoney, percentageCents } from '../draft-validation';

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function tryCents(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  try {
    return moneyCents(value);
  } catch {
    return null;
  }
}

function isStandardNzRate(rate: string): boolean {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(rate);
  if (!match) return false;
  const fraction = match[2] ?? '';
  const numerator = BigInt(`${match[1]}${fraction}`);
  const denominator = 10n ** BigInt(fraction.length);
  return numerator === 0n || numerator === 15n * denominator;
}

function lineNetCents(line: Record<string, unknown>): bigint | null {
  if (typeof line.quantity !== 'string' || typeof line.unitPrice !== 'string') return null;
  try {
    return multiplyMoney(line.quantity, line.unitPrice);
  } catch {
    return null;
  }
}

function gstFromRates(lines: unknown[]): bigint | null {
  let gst = 0n;
  for (const value of lines) {
    const line = record(value);
    if (!line || typeof line.gstRate !== 'string') return null;
    const net = lineNetCents(line);
    if (net == null) return null;
    try {
      gst += percentageCents(net, line.gstRate);
    } catch {
      return null;
    }
  }
  return gst;
}

function withinOneCent(actual: bigint, expected: bigint): boolean {
  const delta = actual > expected ? actual - expected : expected - actual;
  return delta <= 1n;
}

/**
 * A model sometimes copies the GST dollar amount into gstRate (8.48 instead of 15).
 * Rewrite that rate only when 15% of the line reproduces the amount and the document GST.
 * Uses the same half-up cent maths as import draft validation.
 */
export function resolveImportedGstRates(lines: unknown[], documentGst: unknown): { lines: unknown[]; rewritten: boolean[] } {
  const unchanged = { lines, rewritten: lines.map(() => false) };
  const document = tryCents(documentGst);
  const rated = gstFromRates(lines);
  if (document == null || rated == null || withinOneCent(rated, document)) return unchanged;

  const rewritten: boolean[] = [];
  const next = lines.map((value) => {
    const line = record(value);
    if (!line || typeof line.gstRate !== 'string' || isStandardNzRate(line.gstRate)) {
      rewritten.push(false);
      return value;
    }
    const net = lineNetCents(line);
    const asMoney = tryCents(line.gstRate);
    if (net == null || asMoney == null) {
      rewritten.push(false);
      return value;
    }
    let atFifteen: bigint;
    try {
      atFifteen = percentageCents(net, '15');
    } catch {
      rewritten.push(false);
      return value;
    }
    if (!withinOneCent(atFifteen, asMoney)) {
      rewritten.push(false);
      return value;
    }
    rewritten.push(true);
    return { ...line, gstRate: '15' };
  });
  const resolved = gstFromRates(next);
  if (resolved != null && withinOneCent(resolved, document)) return { lines: next, rewritten };
  return unchanged;
}
