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
  issueDate: date,
  dueDate: date,
  lifecycleStatus: z.enum(['draft', 'received', 'void']),
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']),
  displayStatus: z.enum(['draft', 'received', 'overdue', 'partial', 'paid', 'void']),
  currency: z.string().min(1),
  taxInclusive: z.boolean(),
  subtotal: money,
  taxAmount: money,
  total: money,
  totalPaid: money,
  balanceDue: money,
  notes: z.string().nullable(),
  lines: z.array(billLineSchema).min(1),
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

export const recordBillPaymentRequestSchema = z.object({
  bankAccountId: z.string().uuid(),
  amount: positiveDecimal,
  paymentDate: date,
  referenceNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
}).strict();

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

export type VendorDto = z.infer<typeof vendorSchema>;
export type CreateVendorRequest = z.infer<typeof createVendorRequestSchema>;
export type UpdateVendorRequest = z.infer<typeof updateVendorRequestSchema>;
export type BillLineInput = z.infer<typeof billLineInputSchema>;
export type BillDto = z.infer<typeof billSchema>;
export type CreateBillRequest = z.infer<typeof createBillRequestSchema>;
export type UpdateBillRequest = z.infer<typeof updateBillRequestSchema>;
export type RecordBillPaymentRequest = z.infer<typeof recordBillPaymentRequestSchema>;
export type BillPaymentDto = z.infer<typeof billPaymentSchema>;
