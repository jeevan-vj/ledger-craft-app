export function csvCell(value: unknown): string {
  const originalIsString = typeof value === 'string';
  let text = String(value ?? '');
  // Plain decimal text (money is stored as strings, e.g. "-12.50") cannot be a formula, so it stays numeric.
  if (originalIsString && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
