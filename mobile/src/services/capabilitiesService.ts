import type { HealthzResponse } from '@ledgercraft/contracts';
import { apiRequest } from '@/features/auth/api/http';

let cached: Promise<HealthzResponse['capabilities']> | undefined;

export function getServerCapabilities(): Promise<HealthzResponse['capabilities']> {
  cached ??= apiRequest<HealthzResponse>('/api/healthz')
    .then((result) => result.capabilities)
    .catch(() => ({ email: 'unavailable' as const, ai: 'unavailable' as const }));
  return cached;
}

export function resetServerCapabilitiesForTests(): void { cached = undefined; }
