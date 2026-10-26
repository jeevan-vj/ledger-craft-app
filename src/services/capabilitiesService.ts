import { healthzResponseSchema, type HealthzResponse } from '@ledgercraft/contracts';

let cached: Promise<HealthzResponse['capabilities']> | undefined;

export function getServerCapabilities(): Promise<HealthzResponse['capabilities']> {
  cached ??= fetch('/api/healthz', { credentials: 'include' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Capability probe failed');
      return healthzResponseSchema.parse(await response.json()).capabilities;
    })
    .catch(() => ({ email: 'unavailable' as const, ai: 'unavailable' as const }));
  return cached;
}

export function resetServerCapabilitiesForTests(): void {
  cached = undefined;
}
