export interface ProfileCompletenessInput {
  logoUrl?: string | null;
  address?: string | null;
  city?: string | null;
  bankInfo?: string | null;
}

export type MissingProfileField = 'logo' | 'address' | 'bank';

export function getMissingProfileFields(
  profile: ProfileCompletenessInput | null | undefined
): MissingProfileField[] {
  if (!profile) {
    return ['logo', 'address', 'bank'];
  }

  const missing: MissingProfileField[] = [];

  if (!profile.logoUrl?.trim()) {
    missing.push('logo');
  }

  if (!profile.address?.trim() && !profile.city?.trim()) {
    missing.push('address');
  }

  if (!profile.bankInfo?.trim()) {
    missing.push('bank');
  }

  return missing;
}

export function describeMissingFields(fields: MissingProfileField[]): string {
  const labels: Record<MissingProfileField, string> = {
    logo: 'logo',
    address: 'address',
    bank: 'bank details',
  };

  const names = fields.map((field) => labels[field]);
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
