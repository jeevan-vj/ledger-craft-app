import { and, eq, isNotNull } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { expenses } from '../../db/schema/expenses';
import { invoiceAttachments } from '../../db/schema/invoices';
import { billAttachments } from '../../db/schema/purchases';
import { bankTransactionAttachments } from '../../db/schema/bank';
/** Do not remove a file retained as financial source evidence after an uncertain save. */
export async function receiptHasFinancialReference(tx: Database, organisationId: string, objectKey: string): Promise<boolean> {
 const [receipts,invoices,bills,bank] = await Promise.all([
  tx.select({url:expenses.receiptUrl}).from(expenses).where(and(eq(expenses.organisationId,organisationId),isNotNull(expenses.receiptUrl))),
  tx.select({id:invoiceAttachments.id}).from(invoiceAttachments).where(and(eq(invoiceAttachments.organisationId,organisationId),eq(invoiceAttachments.objectKey,objectKey))).limit(1),
  tx.select({id:billAttachments.id}).from(billAttachments).where(and(eq(billAttachments.organisationId,organisationId),eq(billAttachments.objectKey,objectKey))).limit(1),
  tx.select({id:bankTransactionAttachments.id}).from(bankTransactionAttachments).where(and(eq(bankTransactionAttachments.organisationId,organisationId),eq(bankTransactionAttachments.objectKey,objectKey))).limit(1),
 ]);
 if(invoices.length || bills.length || bank.length)return true;
 return receipts.some(value=>{try{const url=new URL(value.url!,'https://receipt.invalid');return url.pathname==='/api/objects'&&url.searchParams.get('key')===objectKey;}catch{return false}});
}
