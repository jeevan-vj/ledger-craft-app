import { decimal } from '../invoices/money';

export const MINIMUM_SUGGESTION_SCORE = 70;

export type SuggestionScoringInput = {
  transactionAmount: string;
  transactionDate: string;
  transactionReference: string | null;
  transactionDescription: string;
  candidateAmount: string;
  candidateDate: string;
  candidateReference: string | null;
  candidateDescription: string;
  candidateCounterparty: string | null;
};

function daysBetween(first: string, second: string): number {
  const left = Date.parse(`${first}T00:00:00Z`);
  const right = Date.parse(`${second}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right) / 86_400_000;
}

export function fuzzyStringMatch(first: string, second: string): number {
  const left = first.toLowerCase().trim();
  const right = second.toLowerCase().trim();
  if (left === right) return 1;
  if (!left || !right) return 0;
  if (left.includes(right) || right.includes(left)) return 0.8;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        (current[column - 1] ?? 0) + 1,
        (previous[column] ?? 0) + 1,
        (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - (previous[right.length] ?? 0) / Math.max(left.length, right.length);
}

function addStringScore(
  score: number,
  reasons: string[],
  first: string | null,
  second: string | null,
  strongThreshold: number,
  strongReason: string,
  partialReason: string,
) {
  if (!first || !second) return score;
  const match = fuzzyStringMatch(first, second);
  if (match > strongThreshold) {
    reasons.push(strongReason);
    return score + 15;
  }
  if (match > 0.4) {
    reasons.push(partialReason);
    return score + 8;
  }
  return score;
}

export function scoreSuggestion(input: SuggestionScoringInput): { score: number; reasons: string[] } | null {
  const reasons: string[] = [];
  const amount = decimal(input.transactionAmount);
  const candidate = decimal(input.candidateAmount);
  const difference = amount.sub(candidate).abs();
  const exactAmount = difference.compare(0) === 0;
  const dayDifference = daysBetween(input.transactionDate, input.candidateDate);
  const referenceMatch = input.transactionReference && input.candidateReference
    ? fuzzyStringMatch(input.transactionReference, input.candidateReference)
    : 0;

  if (exactAmount && dayDifference <= 3) {
    reasons.push('Exact amount match');
    reasons.push(dayDifference === 0 ? 'Same date' : `Within ${Math.round(dayDifference)} day${dayDifference === 1 ? '' : 's'}`);
    if (referenceMatch > 0.8) reasons.push('Reference match');
    return { score: 100, reasons };
  }

  let score = 0;
  if (candidate.compare(0) > 0) {
    const percent = difference.div(candidate).mul(100);
    if (exactAmount) { score += 40; reasons.push('Exact amount match'); }
    else if (percent.compare(1) <= 0) { score += 35; reasons.push('Amount within 1%'); }
    else if (percent.compare(5) <= 0) { score += 25; reasons.push('Amount within 5%'); }
    else if (percent.compare(10) <= 0) { score += 15; reasons.push('Amount within 10%'); }
  }

  if (dayDifference === 0) { score += 30; reasons.push('Same date'); }
  else if (dayDifference <= 1) { score += 25; reasons.push('Within 1 day'); }
  else if (dayDifference <= 3) { score += 15; reasons.push(`Within ${Math.round(dayDifference)} days`); }
  else if (dayDifference <= 30) { score += 5; reasons.push(`Within ${Math.round(dayDifference)} days`); }

  score = addStringScore(score, reasons, input.transactionReference, input.candidateReference, 0.8, 'Reference match', 'Partial reference match');
  const descriptionTarget = [input.candidateDescription, input.candidateCounterparty].filter(Boolean).join(' ');
  score = addStringScore(score, reasons, input.transactionDescription, descriptionTarget, 0.7, 'Description match', 'Partial description match');

  return score < MINIMUM_SUGGESTION_SCORE ? null : { score: Math.min(score, 100), reasons };
}
