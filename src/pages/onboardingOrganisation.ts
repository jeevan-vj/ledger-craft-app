/** Rename the signup placeholder once, and leave a name the owner already chose. */
export function organisationNameAfterOnboarding(currentName: string, ownerName: string, businessName: string): string | null {
  const trimmedOwner = ownerName.trim();
  const placeholder = trimmedOwner.length > 0 ? `${trimmedOwner}'s organisation` : 'Organisation';
  const nextName = businessName.trim();
  if (currentName === placeholder && nextName.length >= 2 && currentName !== nextName) return nextName;
  return null;
}
