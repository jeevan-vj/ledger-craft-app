import type { TaxReturnDto } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';
import { randomId } from '@/utils/id';

const attempts = new Map<string, { body: string; key: string }>();
/** A lost create response must retry the original body, including review timestamps. */
export async function writeTaxDraft(data: object, existingId?: string): Promise<TaxReturnDto> {
  const path = existingId ? `/api/tax-returns/${existingId}` : '/api/tax-returns';
  const logical = `${path}:${JSON.stringify(data, (key, value) => key === 'reviewedAt' || key === 'preparedAt' ? undefined : value)}`;
  let attempt = attempts.get(logical);
  if (!attempt) { attempt = { body: JSON.stringify(data), key: randomId() }; attempts.set(logical, attempt); }
  const saved = await apiRequest<TaxReturnDto>(path, { method: existingId ? 'PATCH' : 'POST', headers: { 'Idempotency-Key': attempt.key }, body: attempt.body });
  attempts.delete(logical);
  return saved;
}
