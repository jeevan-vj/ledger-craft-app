// Published dates transcribed from date-holidays NZ data, which cites MBIE's
// Matariki Advisory Group 2022–2052 calendar. See docs/evidence/issue-115/nz-calendar-sources.md.
const MATARIKI = new Set([
  '2022-06-24',
  '2023-07-14',
  '2024-06-28',
  '2025-06-20',
  '2026-07-10',
  '2027-06-25',
  '2028-07-14',
  '2029-07-06',
  '2030-06-21',
  '2031-07-11',
  '2032-07-02',
  '2033-06-24',
  '2034-07-07',
  '2035-06-29',
  '2036-07-18',
  '2037-07-10',
  '2038-06-25',
  '2039-07-15',
  '2040-07-06',
  '2041-07-19',
  '2042-07-11',
  '2043-07-03',
  '2044-06-24',
  '2045-07-07',
  '2046-06-29',
  '2047-07-19',
  '2048-07-03',
  '2049-06-25',
  '2050-07-15',
  '2051-06-30',
  '2052-06-21',
]);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return utc(year, month, (h + l - 7 * m + 114) % 31 + 1);
}
export function nzNationalHolidays(year: number): Set<string> {
  const days = new Set<string>();
  const add = (date: Date) => days.add(iso(date));
  for (const [month, first] of [[1, 1], [12, 25]]) {
    const pair = [utc(year, month, first), utc(year, month, first + 1)];
    pair.forEach(add);
    for (const date of pair) if (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
      const observed = new Date(date);
      do { observed.setUTCDate(observed.getUTCDate() + 1); } while (observed.getUTCDay() !== 1);
      while (days.has(iso(observed))) observed.setUTCDate(observed.getUTCDate() + 1);
      add(observed);
    }
  }
  for (const [month, day] of [[2, 6], [4, 25]]) {
    const date = utc(year, month, day); add(date);
    if (year >= 2014 && (date.getUTCDay() === 0 || date.getUTCDay() === 6)) {
      date.setUTCDate(date.getUTCDate() + (date.getUTCDay() === 0 ? 1 : 2)); add(date);
    }
  }
  const sunday = easter(year), friday = new Date(sunday), monday = new Date(sunday);
  friday.setUTCDate(friday.getUTCDate() - 2); monday.setUTCDate(monday.getUTCDate() + 1); add(friday); add(monday);
  for (const [month, occurrence] of [[6, 1], [10, 4]]) {
    const date = utc(year, month, 1);
    date.setUTCDate(1 + (8 - date.getUTCDay()) % 7 + (occurrence - 1) * 7); add(date);
  }
  for (const date of MATARIKI) if (date.startsWith(String(year))) days.add(date);
  if (year === 2022) days.add('2022-09-26');
  return days;
}
export function nextNzNationalBusinessDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  for (let step = 0; step < 20; step += 1) {
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !nzNationalHolidays(date.getUTCFullYear()).has(iso(date))) return iso(date);
    date.setUTCDate(date.getUTCDate() + 1);
  }
  throw new Error('Unable to resolve the NZ working-day calendar');
}
