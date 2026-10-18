const moneyFormatterCache = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  const key = currency.toUpperCase();
  const cached = moneyFormatterCache.get(key);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: key,
    minimumFractionDigits: 2,
  });
  moneyFormatterCache.set(key, formatter);
  return formatter;
}

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

export function formatMoney(amount: number | string, currency = 'NZD'): string {
  const formatter = formatterFor(currency);
  const numeric = typeof amount === 'number' ? amount : Number(amount);
  if (typeof amount === 'number' && !Number.isFinite(amount)) return formatter.format(0);

  const options = formatter.resolvedOptions();
  const parts = roundedParts(String(amount), options.maximumFractionDigits ?? 2);
  if (!parts) return formatter.format(Number.isFinite(numeric) ? numeric : 0);

  const sample = formatter.formatToParts(1234.5);
  const currencyPart = sample.find((part) => part.type === 'currency')?.value ?? currency.toUpperCase();
  const integerIndex = sample.findIndex((part) => part.type === 'integer');
  const currencyIndex = sample.findIndex((part) => part.type === 'currency');
  const group = sample.find((part) => part.type === 'group')?.value ?? ',';
  const decimal = sample.find((part) => part.type === 'decimal')?.value ?? '.';
  const groupedWhole = parts.whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const number = parts.fraction ? `${groupedWhole}${decimal}${parts.fraction}` : groupedWhole;
  const sign = parts.negative ? '-' : '';

  return currencyIndex >= 0 && currencyIndex < integerIndex
    ? `${sign}${currencyPart}${number}`
    : `${sign}${number} ${currencyPart}`;
}
