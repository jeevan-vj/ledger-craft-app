/** GST included in a receipt total. `115` at 15% is `15.00`. */
export function includedGst(total: number, ratePercent: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(ratePercent) || ratePercent <= 0) return 0;
  const cents = Math.round(total * 100);
  const gstCents = Math.round((cents * ratePercent) / (100 + ratePercent));
  return gstCents / 100;
}
