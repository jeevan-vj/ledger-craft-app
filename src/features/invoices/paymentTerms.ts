export const PAYMENT_TERM_PRESETS = [
  { code: 'due_on_receipt', days: 0, label: 'Due on receipt' },
  { code: 'net_7', days: 7, label: '7 days' },
  { code: 'net_14', days: 14, label: '14 days' },
  { code: 'net_30', days: 30, label: '30 days' },
  { code: 'net_60', days: 60, label: '60 days' },
] as const;

export type PaymentTermCode = (typeof PAYMENT_TERM_PRESETS)[number]['code'] | 'custom';

export function addDaysToDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function paymentTermCodeFromDays(days: number): PaymentTermCode {
  const preset = PAYMENT_TERM_PRESETS.find((item) => item.days === days);
  return preset?.code ?? 'custom';
}

export function paymentTermLabel(days: number): string {
  const preset = PAYMENT_TERM_PRESETS.find((item) => item.days === days);
  if (preset) return preset.label;
  return `${days} days`;
}

export function dueDateMatchesTerm(date: Date, dueDate: Date, days: number): boolean {
  const expected = addDaysToDate(date, days);
  return expected.toDateString() === dueDate.toDateString();
}
