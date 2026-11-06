export interface MoneyRow { amount: string }

export function cents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return 0n;
  const amount = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] === '-' ? -amount : amount;
}

export function moneyFromCents(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function calculateAmountLeft(
  bankAmount: string,
  allocations: MoneyRow[],
  splits: MoneyRow[],
  bankFee: string,
) {
  const allocatedCents = [...allocations, ...splits]
    .reduce((sum, item) => sum + cents(item.amount), cents(bankFee || '0'));
  const bankCents = cents(bankAmount);
  return {
    allocated: moneyFromCents(allocatedCents),
    amountLeft: moneyFromCents(bankCents - allocatedCents),
    overflow: allocatedCents > bankCents,
    complete: allocatedCents === bankCents && bankCents > 0n,
  };
}

export function suggestedAllocationAmount(bankAmount: string, balanceDue: string, alreadyAllocated = '0'): string {
  const available = cents(bankAmount) - cents(alreadyAllocated);
  return moneyFromCents(available < cents(balanceDue) ? available : cents(balanceDue));
}

export function bankFeeEligible(type: 'debit' | 'credit', bankAmount: string, amountLeft: string): boolean {
  const remainder = cents(amountLeft);
  return type === 'debit' && remainder > 0n && remainder * 10n <= cents(bankAmount);
}
