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

export function formatMoney(amount: number, currency = 'NZD'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return formatterFor(currency).format(value);
}
