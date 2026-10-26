export function providerSecretWarning(secretNames) {
  const names = new Set(secretNames);
  const missingEmail = ['RESEND_API_KEY', 'RESEND_FROM'].filter((name) => !names.has(name));
  const parts = [];
  if (missingEmail.length) parts.push(`email unavailable (missing ${missingEmail.join(', ')})`);
  return parts.length ? `NON-FATAL provider warning: ${parts.join('; ')}` : null;
}
