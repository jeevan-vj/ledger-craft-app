import type { CreateInvoiceRequest } from '@ledgercraft/contracts';
import { apiError } from '../../http-error';
import { decimal, Decimal, roundMoney } from './money';

export type ComputedInvoiceTotals = {
  lines: Array<{
    description: string;
    quantity: string;
    unit: string;
    rate: string;
    rateUnit: string;
    tax: string;
    total: string;
  }>;
  subtotal: string;
  taxAmount: string;
  discountType: 'fixed' | 'percent';
  discountPercent: string | null;
  discount: string | null;
  additionalCharges: string | null;
  additionalChargesList: CreateInvoiceRequest['additionalChargesList'];
  total: string;
  taxInclusive: boolean;
};

type DiscountInput = {
  discountType?: 'fixed' | 'percent';
  discountPercent?: string | null;
  discount?: string | null;
  additionalCharges?: string | null;
  additionalChargesList?: CreateInvoiceRequest['additionalChargesList'];
  taxInclusive?: boolean;
  taxRate?: string | null;
  items: CreateInvoiceRequest['items'];
};

/**
 * Exclusive GST: lines → exclusive subtotal → discount → GST on (subtotal − discount) → add charges.
 * Inclusive GST: discount the GST-inclusive line total (current server policy); GST stays the line extract.
 * Additional charges are not discounted and are not taxed.
 */
export function computeInvoiceTotals(
  input: DiscountInput,
  defaultTaxRatePercent: string | number,
): ComputedInvoiceTotals {
  const taxInclusive = input.taxInclusive ?? true;
  const taxRatePercent = decimal(input.taxRate ?? defaultTaxRatePercent);
  const taxRate = taxRatePercent.div(100);

  const discountType = input.discountType ?? 'fixed';

  const lines = input.items.map((item) => {
    const quantity = decimal(item.quantity);
    const rate = decimal(item.rate);
    const lineAmount = quantity.mul(rate);
    let exclusive = lineAmount;
    let tax = decimal(0);
    if (taxRate.compare(0) > 0) {
      if (taxInclusive) {
        exclusive = lineAmount.div(taxRate.add(1));
        tax = lineAmount.sub(exclusive);
      } else {
        tax = lineAmount.mul(taxRate);
      }
    }
    return {
      description: item.description,
      quantity: roundMoney(quantity),
      unit: item.unit ?? 'ea',
      rate: roundMoney(rate),
      rateUnit: item.rateUnit ?? item.unit ?? 'ea',
      tax: roundMoney(tax),
      total: roundMoney(taxInclusive ? lineAmount : exclusive),
      exclusive,
      inclusive: taxInclusive ? lineAmount : exclusive.add(tax),
      taxValue: tax,
    };
  });

  const subtotalNumber = lines.reduce((sum, line) => sum.add(line.exclusive), decimal(0));
  const additionalCharges = input.additionalChargesList !== undefined
    ? input.additionalChargesList.reduce((sum, charge) => {
        if (!charge.isActive) return sum;
        const amount = decimal(charge.amount);
        return sum.add(charge.calculationType === 'percentage' ? subtotalNumber.mul(amount).div(100) : amount);
      }, decimal(0))
    : decimal(input.additionalCharges);
  const inclusiveSubtotal = lines.reduce((sum, line) => sum.add(line.inclusive), decimal(0));
  const discountBase = taxInclusive ? inclusiveSubtotal : subtotalNumber;
  const { amount: discountAmount, percent: discountPercent } = resolveDiscount(input, discountType, discountBase);

  let taxAmountNumber: Decimal;
  let totalNumber: Decimal;
  if (taxInclusive) {
    taxAmountNumber = lines.reduce((sum, line) => sum.add(line.taxValue), decimal(0));
    totalNumber = inclusiveSubtotal.sub(discountAmount).add(additionalCharges);
  } else {
    const taxable = subtotalNumber.sub(discountAmount);
    taxAmountNumber = taxRate.compare(0) > 0 ? taxable.mul(taxRate) : decimal(0);
    totalNumber = taxable.add(taxAmountNumber).add(additionalCharges);
  }

  return {
    lines: lines.map(({ exclusive: _exclusive, inclusive: _inclusive, taxValue: _taxValue, ...line }) => line),
    subtotal: roundMoney(subtotalNumber),
    taxAmount: roundMoney(taxAmountNumber),
    discountType,
    discountPercent,
    discount: discountAmount.compare(0) === 0 ? null : roundMoney(discountAmount),
    additionalChargesList: input.additionalChargesList,
    additionalCharges: additionalCharges.compare(0) === 0 ? null : roundMoney(additionalCharges),
    total: roundMoney(totalNumber),
    taxInclusive,
  };
}

function resolveDiscount(
  input: DiscountInput,
  discountType: 'fixed' | 'percent',
  discountBase: Decimal,
): { amount: Decimal; percent: string | null } {
  if (discountType === 'percent') {
    const percent = decimal(input.discountPercent);
    if (percent.compare(0) < 0 || percent.compare(100) > 0) {
      throw apiError(400, 'VALIDATION_ERROR', 'Enter a discount between 0 and 100%');
    }
    const amount = decimal(discountBase.mul(percent).div(100).toFixed());
    return { amount, percent: roundMoney(percent) };
  }

  const amount = decimal(input.discount);
  if (amount.compare(0) < 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'Discount must be a positive amount');
  }
  if (amount.compare(discountBase) > 0) {
    throw apiError(400, 'VALIDATION_ERROR', "Discount can't exceed the subtotal");
  }
  return { amount, percent: null };
}
