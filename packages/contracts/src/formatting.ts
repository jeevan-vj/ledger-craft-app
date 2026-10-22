import type { CurrencyDefinitionDto, LocalizationSettingsDto } from './currency';

type CurrencyPresentation = Pick<CurrencyDefinitionDto, 'precision' | 'symbol' | 'symbolPosition'>;

function roundedParts(value: string, precision: number) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return { negative: false, whole: '0', fraction: ''.padEnd(precision, '0') };
  const negative = match[1] === '-';
  const whole = match[2] ?? '0';
  const fraction = match[3] ?? '';
  const scale = 10n ** BigInt(precision);
  let minor = BigInt(whole) * scale + BigInt(fraction.slice(0, precision).padEnd(precision, '0') || '0');
  if (Number(fraction[precision] ?? '0') >= 5) minor += 1n;
  return { negative: negative && minor !== 0n, whole: (minor / scale).toString(), fraction: precision ? (minor % scale).toString().padStart(precision, '0') : '' };
}

export function formatCanonicalMoney(value: string, currency: CurrencyPresentation, numberFormat: LocalizationSettingsDto['numberFormat']): string {
  const parts = roundedParts(value, currency.precision);
  const group = numberFormat === '1,234.56' ? ',' : numberFormat === '1.234,56' ? '.' : ' ';
  const decimal = numberFormat === '1,234.56' ? '.' : ',';
  const grouped = parts.whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const amount = `${parts.negative ? '-' : ''}${grouped}${parts.fraction ? `${decimal}${parts.fraction}` : ''}`;
  return currency.symbolPosition === 'before' ? `${currency.symbol}${amount}` : `${amount} ${currency.symbol}`;
}

export function formatDateOnly(value: string, format: LocalizationSettingsDto['dateFormat']): string {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  if (format === 'DD/MM/YYYY') return `${day}/${month}/${year}`;
  if (format === 'MM/DD/YYYY') return `${month}/${day}/${year}`;
  return value;
}

function priorDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function financialYearForDate(value: string, startMonth: number, startDay: number) {
  const year = Number(value.slice(0, 4));
  const suffix = `${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const startYear = value.slice(5) >= suffix ? year : year - 1;
  const from = `${startYear}-${suffix}`;
  const to = priorDate(startYear + 1, startMonth, startDay);
  return { from, to, label: `FY ${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}` };
}
