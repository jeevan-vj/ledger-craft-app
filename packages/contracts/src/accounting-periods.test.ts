import { describe, expect, it } from 'vitest';
import { closeAccountingPeriodRequestSchema, reopenAccountingPeriodRequestSchema } from './accounting-periods';
describe('reviewed accounting-period cutoff mutations',()=>{
 it('requires a real date, review, reason and optimistic revision without accepting company identity',()=>{
  const input={through:'2026-10-31',reason:'October reconciled by accountant',reviewed:true,expectedRevision:0};
  expect(closeAccountingPeriodRequestSchema.parse(input)).toEqual(input);
  for(const value of [{...input,through:'2026-02-30'},{...input,reviewed:false},{...input,reason:'short'},{...input,expectedRevision:-1},{...input,organisationId:'other'}])expect(closeAccountingPeriodRequestSchema.safeParse(value).success).toBe(false);
 });
 it('requires a reasoned reopen from an exact calendar date',()=>{
  expect(reopenAccountingPeriodRequestSchema.parse({from:'2026-10-01',reason:'Correct a reviewed supplier bill',reviewed:true,expectedRevision:1}).from).toBe('2026-10-01');
  expect(reopenAccountingPeriodRequestSchema.safeParse({from:'2026-02-30',reason:'Reviewed correction',reviewed:true,expectedRevision:1}).success).toBe(false);
 });
});
