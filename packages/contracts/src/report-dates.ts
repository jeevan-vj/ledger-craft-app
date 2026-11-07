/** Date-only reporting windows. No device-local arithmetic or financial amounts. */
export type ReportPreset = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_financial_year' | 'last_financial_year' | 'year_to_date' | 'this_gst_period';
export const reportPresetLabels: Record<ReportPreset, string> = { this_month: 'This month', last_month: 'Last month', this_quarter: 'This quarter', last_quarter: 'Last quarter', this_financial_year: 'This financial year', last_financial_year: 'Last financial year', year_to_date: 'Financial year to date', this_gst_period: 'This GST period' };
const iso = (value: Date) => value.toISOString().slice(0, 10);
export function reportToday(now = new Date(), timezone = 'Pacific/Auckland') {
 const parts = new Intl.DateTimeFormat('en-NZ', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
 return `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}-${parts.find(p=>p.type==='day')!.value}`;
}
function dateParts(value: string) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || iso(new Date(`${value}T00:00:00Z`)) !== value) throw new Error('Invalid report date');
 return value.split('-').map(Number);
}
export function reportDatePreset(preset: ReportPreset, asOf: string | Date = new Date(), yearEndMonth = 3, gstPeriod?: {periodStart?:string;periodEnd?:string}, timezone = 'Pacific/Auckland', yearStartDay = 1): {from:string;to:string} {
 const today=typeof asOf==='string'?asOf:reportToday(asOf,timezone);const [y,m]=dateParts(today);
 if (!Number.isInteger(yearEndMonth)||yearEndMonth<1||yearEndMonth>12)throw new Error('Financial year end month must be 1–12');
 if(preset==='this_gst_period'){if(!gstPeriod?.periodStart||!gstPeriod?.periodEnd)throw new Error('Confirm registered GST settings before using this GST period');return {from:gstPeriod.periodStart,to:gstPeriod.periodEnd};}
 if(preset==='this_month'||preset==='last_month') {const start=new Date(Date.UTC(y,m-1-(preset==='last_month'?1:0),1));return {from:iso(start),to:iso(new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)))};}
 if(preset==='this_quarter'||preset==='last_quarter') {const start=new Date(Date.UTC(y,Math.floor((m-1)/3)*3-(preset==='last_quarter'?3:0),1));return {from:iso(start),to:iso(new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+3,0)))};}
 const startMonth=yearEndMonth%12;const possibleStart=iso(new Date(Date.UTC(y,startMonth,yearStartDay)));const startYear=today<possibleStart?y-1:y;const offset=preset==='last_financial_year'?1:0;
 const from=iso(new Date(Date.UTC(startYear-offset,startMonth,yearStartDay)));
 return {from,to:preset==='year_to_date'?today:iso(new Date(Date.UTC(startYear-offset+1,startMonth,yearStartDay-1)))};
}
export function reportColumnPeriods(from:string,to:string,mode:'month'|'quarter') {
 dateParts(from);dateParts(to);if(from>to)throw new Error('Report dates are reversed');
 const result:Array<{from:string;to:string;label:string}>=[];let start=from;
 while(start<=to){if(result.length>=120)throw new Error('Column reports support at most 120 periods');const [y,m]=dateParts(start);const month=mode==='month'?m-1:Math.floor((m-1)/3)*3;const end=iso(new Date(Date.UTC(y,month+(mode==='month'?1:3),0)));const label=mode==='month'?new Intl.DateTimeFormat('en-NZ',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${start}T00:00:00Z`)):`${['Jan–Mar','Apr–Jun','Jul–Sep','Oct–Dec'][Math.floor((m-1)/3)]} ${y}`;result.push({from:start,to:end<to?end:to,label});start=iso(new Date(Date.parse(`${end}T00:00:00Z`)+86_400_000));}
 return result;
}
