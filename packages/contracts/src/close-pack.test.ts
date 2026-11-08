import { expect, it } from 'vitest';
import { closePackManifestSchema, closePackQuerySchema } from './close-pack';
it('accepts only a real ordered and bounded unfiltered accounting period', () => {
  expect(closePackQuerySchema.parse({ from: '2026-10-01', to: '2026-10-31' })).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  for (const input of [{from:'2026-02-30',to:'2026-03-31'},{from:'2026-11-01',to:'2026-10-31'},{from:'2020-01-01',to:'2026-10-31'},{from:'2026-10-01',to:'2026-10-31',organisationId:crypto.randomUUID()},{from:'2026-10-01',to:'2026-10-31',basis:'cash'}]) expect(closePackQuerySchema.safeParse(input).success).toBe(false);
});
it('requires provenance, exact member checksums, and explicit close/readiness state', () => {
  const manifest={version:'ledgercraft-close-pack-v1',organisationName:'Kauri',period:{from:'2026-10-01',to:'2026-10-31'},basis:'accrual',baseCurrency:'NZD',generatedAt:'2026-11-08T00:00:00.000Z',periodLock:{closedThrough:null,revision:0},warnings:['Accounting period is not closed.'],members:[{name:'trial-balance.csv',mediaType:'text/csv',bytes:100,sha256:'a'.repeat(64)}]};
  expect(closePackManifestSchema.parse(manifest)).toEqual(manifest);
  expect(closePackManifestSchema.safeParse({...manifest,members:[{...manifest.members[0],name:'../secret.csv'}]}).success).toBe(false);
  expect(closePackManifestSchema.safeParse({...manifest,members:[{...manifest.members[0],sha256:'bad'}]}).success).toBe(false);
});
