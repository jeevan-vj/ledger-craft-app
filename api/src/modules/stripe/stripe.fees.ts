export type StripeFeeConfig = { basisPoints: number; fixedCents: number };

export function calculatePlatformFeeCents(amountCents: number, config: StripeFeeConfig): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Payment amount must be positive cents');
  if (!Number.isSafeInteger(config.basisPoints) || config.basisPoints < 0 || config.basisPoints > 10_000) {
    throw new Error('Stripe platform fee basis points must be between 0 and 10000');
  }
  if (!Number.isSafeInteger(config.fixedCents) || config.fixedCents < 0) {
    throw new Error('Stripe platform fixed fee must be non-negative cents');
  }
  const calculated = Math.round((amountCents * config.basisPoints) / 10_000) + config.fixedCents;
  return Math.min(calculated, amountCents - 1);
}
