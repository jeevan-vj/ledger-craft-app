import {eq} from 'drizzle-orm';
import type {Database} from '../../db/client';
import {invoices} from '../../db/schema/invoices';
import {bills} from '../../db/schema/purchases';
import {bankReconciliationActionItems} from '../../db/schema/reconciliation-actions';
import {gstSettlements} from '../tax/gst-payments.repository';
export async function cashRecognitionLinks(tx:Database,organisationId:string){
 const [settlements,sales,purchases,actions]=await Promise.all([gstSettlements(tx,organisationId),tx.select({id:invoices.id,number:invoices.invoiceNumber}).from(invoices).where(eq(invoices.organisationId,organisationId)),tx.select({id:bills.id,number:bills.billNumber}).from(bills).where(eq(bills.organisationId,organisationId)),tx.select().from(bankReconciliationActionItems).where(eq(bankReconciliationActionItems.organisationId,organisationId))]);
 return {settlements,sales,purchases,actions};
}
export type CashRecognitionLinks=Awaited<ReturnType<typeof cashRecognitionLinks>>;
