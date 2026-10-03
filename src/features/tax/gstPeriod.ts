const QUARTER_START_MONTH: Record<string, number> = {
  Q1: 1,
  Q2: 4,
  Q3: 7,
  Q4: 10,
};

function dateOnly(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getQuarterPeriod(
  year: number,
  quarter: string,
): { startDate: string; endDate: string; dueDate: string } {
  const startMonth = QUARTER_START_MONTH[quarter];
  if (!startMonth) throw new Error(`Unsupported GST quarter: ${quarter}`);
  const endMonth = startMonth + 2;
  const dueMonth = endMonth === 12 ? 1 : endMonth + 1;
  const dueYear = endMonth === 12 ? year + 1 : year;
  return {
    startDate: dateOnly(year, startMonth, 1),
    endDate: dateOnly(year, endMonth, lastDayOfMonth(year, endMonth)),
    dueDate: dateOnly(dueYear, dueMonth, 28),
  };
}
