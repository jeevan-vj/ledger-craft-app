export function formatInvoiceNumber(format: string, sequence: number, date: Date): string {
  return format
    .replaceAll('{YYYY}', String(date.getFullYear()))
    .replaceAll('{MM}', String(date.getMonth() + 1).padStart(2, '0'))
    .replaceAll('{SEQ}', String(sequence).padStart(4, '0'));
}
