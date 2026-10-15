import { expect, it } from 'vitest';
import { toProfile, toUpsertBusinessProfileRequest } from './businessProfileApi';
import type { BusinessProfileDto } from '@ledgercraft/contracts';
it('preserves bank details and clearing through both API mappers', () => {
 const dto = { name: 'Studio', email: 'studio@example.com', bankAccountName: 'Studio Ltd', bankAccountNumber: '01-0123-0000123-00' } as BusinessProfileDto;
 const mapped = toUpsertBusinessProfileRequest(toProfile(dto));
 expect(mapped).toMatchObject({ bankAccountName: dto.bankAccountName, bankAccountNumber: dto.bankAccountNumber });
 expect(toUpsertBusinessProfileRequest({ ...toProfile(dto), bankAccountName: '', bankAccountNumber: null })).toMatchObject({ bankAccountName: '', bankAccountNumber: null });
});
