type Existing = {id?:string;receiptHash?:string|null;vendorName?:string|null;expenseDate?:string;amountText?:string;amount?:number};
const amountKey = (value: string) => value.replace(/^0+(?=\d)/,'').replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
export function receiptDuplicate(input: {receiptHash?:string|null;vendorName:string;expenseDate:string;amount:string}, existing: Existing[], excludeId?:string) {
 return existing.some(value=>(!excludeId || value.id!==excludeId) && ((input.receiptHash && value.receiptHash===input.receiptHash) || (input.vendorName.trim() && value.vendorName?.trim().toLowerCase()===input.vendorName.trim().toLowerCase() && value.expenseDate===input.expenseDate && amountKey(value.amountText ?? String(value.amount ?? ''))===amountKey(input.amount))));
}
