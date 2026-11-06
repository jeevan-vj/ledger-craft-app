import { cents, moneyFromCents } from '../api/bankReconciliationApi';

export function calculateAmountLeft(
  bankAmount: string,
  allocations: Array<{ amount: string }>,
  splits: Array<{ amount: string }>,
  bankFee: string,
) {
  const totalCents = [...allocations, ...splits].reduce((sum, item) => sum + cents(item.amount), cents(bankFee || '0'));
  const bankCents = cents(bankAmount);
  return {
    allocated: moneyFromCents(totalCents),
    amountLeft: moneyFromCents(bankCents - totalCents),
    overflow: totalCents > bankCents,
    complete: totalCents === bankCents && bankCents > 0n,
  };
}
