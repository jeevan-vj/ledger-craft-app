import { z } from 'zod';

const money = z.string().regex(/^\d+(\.\d+)?$/);
const positiveDecimal = money.refine((value) => /^0*(?:\.0*)?$/.test(value) === false, {
  message: 'Must be greater than 0',
});
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const vendorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  taxId: z.string().nullable(),
  address: z.string().nullable(),
  paymentTermDays: z.number().int().min(0).max(365),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  contactName: z.string().nullable(),
  defaultAccountId: z.string().uuid().nullable(),
  defaultTaxRate: money,
  importIdentifier: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const vendorWriteObject = z.object({
  name: z.string().trim().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  contactName: z.string().trim().min(1).nullable().optional(),
  defaultAccountId: z.string().uuid().nullable().optional(),
  defaultTaxRate: money.optional(),
  importIdentifier: z.string().trim().min(1).nullable().optional(),
}).strict();

export const createVendorRequestSchema = vendorWriteObject;
export const updateVendorRequestSchema = vendorWriteObject.partial();
export const vendorListResponseSchema = z.object({ vendors: z.array(vendorSchema) });

export const billLineInputSchema = z.object({
  description: z.string().trim().min(1),
  quantity: positiveDecimal,
  unitPrice: money,
  taxRate: money.default('15'),
  accountId: z.string().uuid().nullable().optional(),
}).strict();

export const billLineSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1),
  quantity: money,
  unitPrice: money,
  taxRate: money,
  subtotal: money,
  taxAmount: money,
  total: money,
  accountId: z.string().uuid().nullable(),
  accountName: z.string().nullable(),
});

export const billSchema = z.object({
  id: z.string().uuid(),
  billNumber: z.string().min(1),
  vendorId: z.string().uuid(),
  vendorName: z.string().min(1),
  vendorReference: z.string().nullable(),
  externalNumber: z.string().max(100).nullable().optional(),
  externalIssuerName: z.string().max(255).nullable().optional(),
  sourceImportDocumentId: z.string().uuid().nullable().optional(),
  issueDate: date,
  dueDate: date,
  lifecycleStatus: z.enum(['draft', 'received', 'void']),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']),
  displayStatus: z.enum(['draft', 'received', 'overdue', 'partial', 'paid', 'void', 'cancelled']),
  currency: z.string().min(1),
  exchangeRate: money.default('1'),
  exchangeRateId: z.string().uuid().nullable().default(null),
  baseCurrency: z.string().min(1).default('NZD'),
  baseSubtotal: money.default('0'),
  baseTaxAmount: money.default('0'),
  baseTotal: money.default('0'),
  taxInclusive: z.boolean(),
  subtotal: money,
  taxAmount: money,
  total: money,
  totalPaid: money,
  balanceDue: money,
  notes: z.string().nullable(),
  lines: z.array(billLineSchema).min(1),
  payments: z.array(z.lazy(() => billPaymentSchema)).default([]),
  attachments: z.array(z.lazy(() => billAttachmentSchema)).default([]),
  history: z.array(z.lazy(() => billHistorySchema)).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const billWriteObject = z.object({
  vendorId: z.string().uuid(),
  vendorReference: z.string().nullable().optional(),
  issueDate: date,
  dueDate: date,
  currency: z.string().min(1).optional(),
  taxInclusive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(billLineInputSchema).min(1),
}).strict();

export const createBillRequestSchema = billWriteObject;
export const updateBillRequestSchema = billWriteObject.partial();
export const billListResponseSchema = z.object({ bills: z.array(billSchema) });

export const paymentAllocationInputSchema = z.object({
  bankAccountId: z.string().uuid(),
  amount: positiveDecimal,
}).strict();

export const recordBillPaymentRequestSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  amount: positiveDecimal.optional(),
  allocations: z.array(paymentAllocationInputSchema).min(2).max(10).optional(),
  paymentDate: date,
  referenceNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
}).strict().superRefine((value, ctx) => {
  const legacy = Boolean(value.bankAccountId && value.amount);
  const split = Boolean(value.allocations);
  if (legacy === split || Boolean(value.bankAccountId) !== Boolean(value.amount)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide one payment account and amount, or two or more allocations' });
  }
});

export const billPaymentSchema = z.object({
  id: z.string().uuid(),
  billId: z.string().uuid(),
  bankAccountId: z.string().uuid(),
  bankAccountName: z.string().min(1),
  amount: money,
  paymentDate: date,
  referenceNumber: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().min(1),
});

export const billAttachmentSchema = z.object({
  id: z.string().uuid(),
  objectKey: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative().max(1_048_576),
  role: z.enum(['attachment', 'source_document']).default('attachment'),
  locked: z.boolean().default(false),
  createdAt: z.string().min(1),
});

export const attachBillObjectRequestSchema = billAttachmentSchema.pick({
  objectKey: true,
  filename: true,
  contentType: true,
  size: true,
}).strict();

export const billHistorySchema = z.object({
  id: z.string().uuid(),
  event: z.enum(['created', 'updated', 'received', 'cancelled', 'restored', 'payment_recorded', 'attachment_added', 'attachment_removed']),
  summary: z.string().min(1),
  createdAt: z.string().min(1),
});

export const billPaymentBatchSchema = z.object({
  payments: z.array(billPaymentSchema).min(1),
  total: money,
});

export const importVendorsRequestSchema = z.object({
  csv: z.string().min(1).max(1_000_000),
  dryRun: z.boolean().default(true),
}).strict();

export const importVendorsResponseSchema = z.object({
  dryRun: z.boolean(),
  validRows: z.number().int().nonnegative(),
  appliedRows: z.number().int().nonnegative(),
  errors: z.array(z.object({ row: z.number().int().positive(), message: z.string().min(1) })),
});

export type VendorDto = z.infer<typeof vendorSchema>;
export type VendorListResponse = z.infer<typeof vendorListResponseSchema>;
export type CreateVendorRequest = z.infer<typeof createVendorRequestSchema>;
export type UpdateVendorRequest = z.infer<typeof updateVendorRequestSchema>;
export type BillLineInput = z.infer<typeof billLineInputSchema>;
export type BillDto = z.infer<typeof billSchema>;
export type BillListResponse = z.infer<typeof billListResponseSchema>;
export type CreateBillRequest = z.infer<typeof createBillRequestSchema>;
export type UpdateBillRequest = z.infer<typeof updateBillRequestSchema>;
export type RecordBillPaymentRequest = z.infer<typeof recordBillPaymentRequestSchema>;
export type BillPaymentDto = z.infer<typeof billPaymentSchema>;
export type BillPaymentBatchDto = z.infer<typeof billPaymentBatchSchema>;
export type BillAttachmentDto = z.infer<typeof billAttachmentSchema>;
export type BillHistoryDto = z.infer<typeof billHistorySchema>;
export type AttachBillObjectRequest = z.infer<typeof attachBillObjectRequestSchema>;
export type ImportVendorsRequest = z.infer<typeof importVendorsRequestSchema>;
export type ImportVendorsResponse = z.infer<typeof importVendorsResponseSchema>;
