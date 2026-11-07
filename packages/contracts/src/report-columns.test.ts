import { describe, expect, it } from 'vitest';
import { financialReportQuerySchema } from './report';
import { reportDatePreset, reportColumnPeriods } from './report-dates';

describe('report columns and NZ date-only presets', () => {
 it('accepts optional month/quarter columns without changing omitted queries', () => {
  const q={from:'2026-04-01',to:'2027-03-31'};
  expect(financialReportQuerySchema.parse({...q,columns:'month'}).columns).toBe('month');
  expect(financialReportQuerySchema.parse(q)).not.toHaveProperty('columns');
  expect(financialReportQuerySchema.safeParse({...q,columns:'week'}).success).toBe(false);
 });
 it('clips month and quarter buckets to the requested range',()=>{
  expect(reportColumnPeriods('2026-04-15','2026-07-10','quarter')).toEqual([{from:'2026-04-15',to:'2026-06-30',label:'Apr–Jun 2026'},{from:'2026-07-01',to:'2026-07-10',label:'Jul–Sep 2026'}]);
  expect(reportColumnPeriods('2026-04-01','2027-03-31','month')).toHaveLength(12);
 });
 it('resolves financial years, custom balance months and Auckland midnight independent of device zone',()=>{
  expect(reportDatePreset('this_financial_year','2026-10-27')).toEqual({from:'2026-04-01',to:'2027-03-31'});
  expect(reportDatePreset('last_financial_year','2026-10-27')).toEqual({from:'2025-04-01',to:'2026-03-31'});
  expect(reportDatePreset('this_financial_year','2026-03-31')).toEqual({from:'2025-04-01',to:'2026-03-31'});
  expect(reportDatePreset('this_financial_year','2026-10-27',6)).toEqual({from:'2026-07-01',to:'2027-06-30'});
  expect(reportDatePreset('this_month',new Date('2026-10-31T11:30:00Z'))).toEqual({from:'2026-11-01',to:'2026-11-30'});
  expect(reportDatePreset('last_month','2024-03-01')).toEqual({from:'2024-02-01',to:'2024-02-29'});
  expect(reportDatePreset('year_to_date','2026-10-27')).toEqual({from:'2026-04-01',to:'2026-10-27'});
  expect(reportDatePreset('this_gst_period','2026-10-27',3,{periodStart:'2026-10-01',periodEnd:'2026-11-30'})).toEqual({from:'2026-10-01',to:'2026-11-30'});
  expect(()=>reportDatePreset('this_gst_period','2026-10-27')).toThrow(/GST/);
 });
});
it('rejects a column range over 120 periods before expensive report generation',()=>{
 expect(financialReportQuerySchema.safeParse({from:'2000-01-01',to:'2026-12-31',columns:'month'}).success).toBe(false);
});
it('rejects impossible date-only periods and respects a non-first-day financial year',()=>{
 expect(financialReportQuerySchema.safeParse({from:'2026-02-30',to:'2026-03-01'}).success).toBe(false);
 expect(reportDatePreset('this_financial_year','2026-07-10',6,undefined,'Pacific/Auckland',15)).toEqual({from:'2025-07-15',to:'2026-07-14'});
});
