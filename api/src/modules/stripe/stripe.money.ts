export function centsToMoney(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Invalid cents');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
