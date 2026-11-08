import { expect, it } from 'vitest';
import * as contracts from './bank-ledger';
it('accepts only a bank identity, never ownership or opening money',()=>{
 const schema=contracts.prepareBankLedgerRequestSchema;
 expect(schema?.safeParse({bankAccountId:'11111111-1111-4111-8111-111111111111'}).success).toBe(true);
 for(const input of [{bankAccountId:'bad'},{bankAccountId:'11111111-1111-4111-8111-111111111111',organisationId:'other'},{bankAccountId:'11111111-1111-4111-8111-111111111111',openingBalance:'10000'}])expect(schema.safeParse(input).success).toBe(false);
});
