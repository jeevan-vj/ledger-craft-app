import type { GstCalculationSnapshot } from '@ledgercraft/contracts';

function signed(value: string) {
  return value.startsWith('-') || value === '0.00' ? value : `+${value}`;
}

export function GstRoundingLine({ calculation }: { calculation?: GstCalculationSnapshot }) {
  if (!calculation || calculation.version !== 'gst-ledger-v3') return null;
  return <p>Rounding difference (ledger minus myIR form): output {signed(calculation.rounding.output)}, input {signed(calculation.rounding.input)}. This line is not included in Box 9 or Box 13.{calculation.roundingReviewRequired ? ' Review this difference before recording the return as filed.' : ''}</p>;
}
