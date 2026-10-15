export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dueDateMatchesTerms(date: string, dueDate: string, paymentTermDays: number): boolean {
  return dueDate === addCalendarDays(date, paymentTermDays);
}
