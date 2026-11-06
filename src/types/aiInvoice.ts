import type { AdditionalCharge, LineItem } from './index';
/** Draft accepted by the legacy conversational adapter; saved totals still come from the invoice API. */
export interface AIInvoiceDraft {
  customer_id: string;
  date?: string;
  due_date: string;
  line_items: Array<Pick<LineItem, 'description' | 'quantity' | 'rate' | 'total'> & Partial<LineItem>>;
  subtotal: number;
  tax_amount?: number;
  discount?: number;
  additional_charges_total?: number;
  additional_charges_list?: AdditionalCharge[];
  total: number;
  notes?: string;
  terms?: string;
  template_name?: string;
}
