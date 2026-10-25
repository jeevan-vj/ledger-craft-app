import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const idList = z.array(z.string().uuid()).max(100).optional();

export const reportBasisSchema = z.enum(['accrual', 'cash']);
export const financialReportQuerySchema = z.object({
  from: date,
  to: date,
  basis: reportBasisSchema.default('accrual'),
  baseCurrency: z.literal('NZD').default('NZD'),
  comparisonFrom: date.optional(),
  comparisonTo: date.optional(),
  accountIds: idList,
  categoryIds: idList,
  customerIds: idList,
  vendorIds: idList,
}).strict().superRefine((value, ctx) => {
  if (value.from > value.to) ctx.addIssue({ code: 'custom', message: 'From date must not be after to date', path: ['from'] });
  if ((value.comparisonFrom == null) !== (value.comparisonTo == null)) {
    ctx.addIssue({ code: 'custom', message: 'Comparison requires both dates', path: ['comparisonFrom'] });
  }
  if (value.comparisonFrom && value.comparisonTo && value.comparisonFrom > value.comparisonTo) {
    ctx.addIssue({ code: 'custom', message: 'Comparison from date must not be after comparison to date', path: ['comparisonFrom'] });
  }
});

export const reportMetaSchema = z.object({
  from: date,
  to: date,
  basis: reportBasisSchema,
  baseCurrency: z.literal('NZD'),
  generatedAt: z.string().min(1),
});

export const reportAccountRowSchema = z.object({
  accountId: z.string().uuid(),
  accountNumber: z.string().nullable(),
  accountName: z.string().min(1),
  accountClass: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  debit: money,
  credit: money,
  balance: money,
});

export const trialBalanceRowSchema = reportAccountRowSchema.extend({
  openingDebit: money,
  openingCredit: money,
  closingDebit: money,
  closingCredit: money,
});

const statementSchema = z.object({
  rows: z.array(reportAccountRowSchema),
});

export const agingItemSchema = z.object({
  id: z.string().uuid(),
  number: z.string().min(1),
  partyId: z.string().uuid(),
  partyName: z.string().min(1),
  issueDate: date,
  dueDate: date,
  balanceDue: money,
  daysOverdue: z.number().int(),
  bucket: z.enum(['current', '1-30', '31-60', '61-90', '90+']),
});

const agingSchema = z.object({
  total: money,
  current: money,
  days1To30: money,
  days31To60: money,
  days61To90: money,
  over90: money,
  items: z.array(agingItemSchema),
});

const documentSummarySchema = z.object({
  subtotal: money,
  tax: money,
  total: money,
  paid: money,
  outstanding: money,
});

export const reportComparisonSchema = z.object({
  from: date,
  to: date,
  revenue: money,
  expenses: money,
  netIncome: money,
  netCashFlow: money,
});

export const financialReportResponseSchema = z.object({
  meta: reportMetaSchema,
  trialBalance: z.object({ rows: z.array(trialBalanceRowSchema), totalDebits: money, totalCredits: money, balanced: z.boolean() }),
  profitLoss: statementSchema.extend({ revenue: money, expenses: money, netIncome: money }),
  balanceSheet: statementSchema.extend({ assets: money, liabilities: money, equity: money, balanced: z.boolean() }),
  cashFlow: statementSchema.extend({ openingCash: money, inflows: money, outflows: money, netCashFlow: money, closingCash: money }),
  receivablesAging: agingSchema,
  payablesAging: agingSchema,
  salesSummary: documentSummarySchema,
  purchaseSummary: documentSummarySchema,
  taxSummary: z.object({
    collected: money,
    paid: money,
    netPayable: money,
    outputGst: money,
    inputGst: money,
    netGst: money,
    position: z.enum(['payable', 'refundable', 'nil']),
    gstAccounts: z.array(reportAccountRowSchema),
    keyAccounts: z.array(reportAccountRowSchema),
    /** GST is always taken from invoice-basis journals, even on a cash-basis report. */
    basis: z.literal('invoice').default('invoice'),
    /** Non-base-currency documents with GST lines left out of this return. */
    foreignCurrencyDocumentsExcluded: z.number().int().nonnegative().default(0),
    warnings: z.array(z.string()).default([]),
  }),
  comparison: reportComparisonSchema.nullable(),
});

export const generalLedgerLineSchema = z.object({
  journalEntryId: z.string().uuid(),
  entryNumber: z.string().min(1),
  date,
  description: z.string().min(1),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  accountId: z.string().uuid(),
  accountNumber: z.string().nullable(),
  accountName: z.string().min(1),
  debit: money,
  credit: money,
  runningBalance: money,
});

export const generalLedgerResponseSchema = z.object({ meta: reportMetaSchema, lines: z.array(generalLedgerLineSchema) });
export const accountStatementResponseSchema = z.object({
  meta: reportMetaSchema,
  account: z.object({ id: z.string().uuid(), number: z.string().nullable(), name: z.string().min(1), currency: z.string().min(3).max(3) }),
  openingBalance: money,
  movements: z.array(generalLedgerLineSchema),
  closingBalance: money,
});

export type ReportBasis = z.infer<typeof reportBasisSchema>;
export type FinancialReportQuery = z.infer<typeof financialReportQuerySchema>;
export type FinancialReportResponse = z.infer<typeof financialReportResponseSchema>;
export type GeneralLedgerResponse = z.infer<typeof generalLedgerResponseSchema>;
export type AccountStatementResponse = z.infer<typeof accountStatementResponseSchema>;
