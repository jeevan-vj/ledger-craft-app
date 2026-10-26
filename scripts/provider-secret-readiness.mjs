export function providerSecretWarning(secretNames) {
  const names = new Set(secretNames);
  const missingEmail = ['RESEND_API_KEY', 'RESEND_FROM'].filter((name) => !names.has(name));
  const hasAi = names.has('OPENAI_API_KEY') || names.has('XAI_API_KEY');
  const parts = [];
  if (missingEmail.length) parts.push(`email unavailable (missing ${missingEmail.join(', ')})`);
  if (!hasAi) parts.push('AI unavailable (missing OPENAI_API_KEY or XAI_API_KEY)');
  return parts.length ? `NON-FATAL provider warning: ${parts.join('; ')}` : null;
}
