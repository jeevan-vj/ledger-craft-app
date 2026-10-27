import { decimal, roundMoney } from '../../../api/src/modules/invoices/money';

/** Exact half of `amount`, rounded with roundMoney, and never above `balance`. */
export function halfPaymentAmount(amount: string | number, balance: string | number = amount): string {
  const half = roundMoney(decimal(amount).div(2));
  const limit = roundMoney(balance);
  return decimal(half).compare(limit) > 0 ? limit : half;
}
