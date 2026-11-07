import { formatNzGstNumber, type TaxReturnDto } from '@ledgercraft/contracts';
import { formatMoney } from '@/utils/money';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value]!));
export function gstReturnRows(saved: TaxReturnDto): [string, string][] {
 const calculation = saved.returnData?.gstCalculation;
 const basis = calculation?.settings?.gstAccountingBasis ?? saved.returnData?.preparation?.basis;
 const rows: [string, string][] = [
  ['Period', `${saved.periodStart} to ${saved.periodEnd}`], ['Registered basis', basis ? basis[0].toUpperCase() + basis.slice(1) : 'Not recorded — review required'],
  ['Saved total sales (including GST)', formatMoney(saved.totalSales)], ['Saved total purchases', formatMoney(saved.totalPurchases)],
  ['Saved GST on sales', formatMoney(saved.gstOnSales)], ['Saved GST on purchases', formatMoney(saved.gstOnPurchases)], ['Saved net GST', formatMoney(saved.netGst)],
 ];
 if (calculation?.settings.taxId) rows.push(['GST No', formatNzGstNumber(calculation.settings.taxId)]);
 if (calculation?.settings.gstRegisteredFrom) rows.push(['GST registered from', calculation.settings.gstRegisteredFrom]);
 if (saved.returnData?.preparation?.dueDate) rows.push(['Due date', saved.returnData.preparation.dueDate]);
 if (saved.irdReference) rows.push(['External myIR confirmation', saved.irdReference]);
 if (calculation?.myIrBoxes) for (const [key, value] of Object.entries(calculation.myIrBoxes)) if (typeof value === 'string') rows.push([`myIR Box ${key}`, formatMoney(value)]);
 if (calculation?.warnings.length) for (const warning of calculation.warnings) rows.push(['Review warning', warning]);
 if (calculation?.fingerprint) rows.push(['Calculation fingerprint', calculation.fingerprint]);
 else rows.push(['Calculation audit', 'Legacy snapshot — review required']);
 if (calculation?.calculatedAt) rows.push(['Calculated at', calculation.calculatedAt]);
 return rows;
}
export function gstReturnTitle(saved: TaxReturnDto) { return saved.status === 'submitted' || saved.status === 'approved' ? 'GST filing record — filed externally' : 'Draft GST preparation — not filed'; }
export function buildGstReturnHtml(saved: TaxReturnDto): string {
 return `<!doctype html><html><head><meta charset="utf-8"><title>GST ${escape(saved.periodStart)}</title><style>body{font:14px Arial,sans-serif;color:#163300;padding:32px}h1{font-size:24px}table{width:100%;border-collapse:collapse}td{padding:10px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}td:last-child{text-align:right}.note{font-size:12px;color:#555;margin-top:24px}</style></head><body><h1>${escape(gstReturnTitle(saved))}</h1><table>${gstReturnRows(saved).map(([label, value]) => `<tr><td>${escape(label)}</td><td>${escape(value)}</td></tr>`).join('')}</table><p class="note">EasyBizInvoice does not submit this return to IRD. File separately in myIR and retain the supporting books. This preparation is not tax advice or filing acceptance.</p></body></html>`;
}
