export function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function dateForPreset(days: number, baseDate = localIsoDate(new Date()), minimumDate?: string) {
  const candidate = parseLocalDate(baseDate);
  candidate.setDate(candidate.getDate() + days);
  const result = localIsoDate(candidate);
  return minimumDate && result < minimumDate ? minimumDate : result;
}
