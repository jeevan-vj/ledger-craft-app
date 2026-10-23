type Presentation = { precision: number; symbol: string; position: 'before' | 'after' };
const DEFAULTS: Record<string, Presentation> = {
  NZD: { precision: 2, symbol: '$', position: 'before' }, AUD: { precision: 2, symbol: 'A$', position: 'before' },
  USD: { precision: 2, symbol: 'US$', position: 'before' }, EUR: { precision: 2, symbol: '€', position: 'before' },
  JPY: { precision: 0, symbol: '¥', position: 'before' }, BHD: { precision: 3, symbol: 'BD', position: 'after' },
};

function roundedParts(amount: string, fractionDigits: number) {
  const match = amount.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;

  const negative = match[1] === '-';
  const whole = match[2] ?? '0';
  const fraction = match[3] ?? '';
  const scale = 10n ** BigInt(fractionDigits);
  const kept = fraction.slice(0, fractionDigits).padEnd(fractionDigits, '0');
  let minor = BigInt(whole) * scale + BigInt(kept || '0');
  if (Number(fraction[fractionDigits] ?? '0') >= 5) minor += 1n;

  const absoluteWhole = (minor / scale).toString();
  const absoluteFraction = fractionDigits
    ? (minor % scale).toString().padStart(fractionDigits, '0')
    : '';
  return { negative: negative && minor !== 0n, whole: absoluteWhole, fraction: absoluteFraction };
}

/** Hermes-safe mirror of the shared formatter; avoids formatToParts and Number conversion. */
export function formatMoney(amount: number | string, currency = 'NZD', presentation?: Presentation): string {
  const definition = presentation ?? DEFAULTS[currency.toUpperCase()] ?? { precision: 2, symbol: currency.toUpperCase(), position: 'before' as const };
  const value = typeof amount === 'number' && !Number.isFinite(amount) ? '0' : String(amount);
  const parts = roundedParts(value, definition.precision) ?? roundedParts('0', definition.precision)!;
  const groupedWhole = parts.whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const number = parts.fraction ? `${groupedWhole}.${parts.fraction}` : groupedWhole;
  const sign = parts.negative ? '-' : '';
  return definition.position === 'before' ? `${sign}${definition.symbol}${number}` : `${sign}${number} ${definition.symbol}`;
}
