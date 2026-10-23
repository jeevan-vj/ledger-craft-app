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
    discountType: 'fixed' | 'percent';
    discountValue: string | null;
    discountAmount: string;
    taxes: Array<{ id: string; name: string; rate: string }>;
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

  const discountType = input.discountType ?? 'fixed';

  const lines = input.items.map((item) => {
    const quantity = decimal(item.quantity);
    const rate = decimal(item.rate);
    const lineAmount = quantity.mul(rate);
    const lineDiscountType = item.discountType ?? 'fixed';
    const lineDiscountValue = decimal(item.discountValue);
    const lineDiscount = lineDiscountType === 'percent'
      ? lineAmount.mul(lineDiscountValue).div(100)
      : lineDiscountValue;
    if (lineDiscountValue.compare(0) < 0 || (lineDiscountType === 'percent' && lineDiscountValue.compare(100) > 0)) {
      throw apiError(400, 'VALIDATION_ERROR', 'Line discount is invalid');
    }
    if (lineDiscount.compare(lineAmount) > 0) throw apiError(400, 'VALIDATION_ERROR', "Line discount can't exceed the line amount");
    const discountedAmount = lineAmount.sub(lineDiscount);
    const taxes = (item.taxes ?? (taxRatePercent.compare(0) > 0 ? [{ id: 'default', name: 'Tax', rate: taxRatePercent.toFixed() }] : []))
      .map((assignment, index) => ({
        id: assignment.id ?? `tax-${index + 1}`,
        name: assignment.name ?? 'Tax',
        rate: assignment.rate ?? '0',
      }));
    const combinedTaxRate = taxes.reduce((sum, assignment) => sum.add(decimal(assignment.rate)), decimal(0)).div(100);
    let exclusive = discountedAmount;
    let tax = decimal(0);
    if (combinedTaxRate.compare(0) > 0) {
      if (taxInclusive) {
        exclusive = discountedAmount.div(combinedTaxRate.add(1));
        tax = discountedAmount.sub(exclusive);
      } else {
        tax = discountedAmount.mul(combinedTaxRate);
      }
    }
    return {
      description: item.description,
      quantity: roundMoney(quantity),
      unit: item.unit ?? 'ea',
      rate: roundMoney(rate),
      rateUnit: item.rateUnit ?? item.unit ?? 'ea',
      tax: roundMoney(tax),
      total: roundMoney(taxInclusive ? discountedAmount : exclusive),
      discountType: lineDiscountType,
      discountValue: item.discountValue == null ? null : roundMoney(lineDiscountValue),
      discountAmount: roundMoney(lineDiscount),
      taxes,
      exclusive,
      inclusive: taxInclusive ? discountedAmount : exclusive.add(tax),
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
  const rawLineTax = lines.reduce((sum, line) => sum.add(line.taxValue), decimal(0));
  const discountRatio = discountBase.compare(0) === 0 ? decimal(0) : discountAmount.div(discountBase);
  if (taxInclusive) {
    taxAmountNumber = rawLineTax.mul(decimal(1).sub(discountRatio));
    totalNumber = inclusiveSubtotal.sub(discountAmount).add(additionalCharges);
  } else {
    const taxable = subtotalNumber.sub(discountAmount);
    taxAmountNumber = rawLineTax.mul(decimal(1).sub(discountRatio));
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
