import { z } from 'zod';

const money = z.string().regex(/^\d+(\.\d+)?$/);
const expenseStatus = z.enum(['pending', 'approved', 'rejected']);
const expensePaymentMethod = z.enum(['cash', 'card', 'bank_transfer', 'check', 'other']);
const gstTreatment = z.enum(['standard', 'zero_rated', 'exempt', 'partial', 'private_use']);
const gstExemptionReason = z.enum([
  'none',
  'motor_vehicle',
  'financial_services',
  'residential_rent',
  'insurance_life',
  'exported_services',
  'entertainment_50',
  'home_office',
  'second_hand_goods',
  'other_exempt',
]);
const percentage = z.number().int().min(0).max(100);

export const expenseCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  color: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const expenseSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1),
  amount: money,
  taxAmount: money,
  currency: z.string().min(1),
  exchangeRate: money,
  exchangeRateId: z.string().uuid().nullable(),
  baseCurrency: z.string().min(1),
  baseAmount: money,
  baseTaxAmount: money,
  expenseDate: z.string().min(1),
  status: expenseStatus,
  isBillable: z.boolean(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  accountId: z.string().uuid().nullable(),
  accountName: z.string().nullable(),
  customerId: z.string().uuid().nullable(),
  customerName: z.string().nullable(),
  vendorName: z.string().nullable(),
  receiptUrl: z.string().nullable(),
  paymentMethod: expensePaymentMethod.nullable(),
  notes: z.string().nullable(),
  gstTreatment,
  gstExemptionReason,
  gstClaimablePercentage: percentage,
  privateUsePercentage: percentage,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const expenseWriteObject = z
  .object({
    description: z.string().min(1),
    amount: money,
    taxAmount: money.optional(),
    currency: z.string().min(1).optional(),
    expenseDate: z.string().min(1),
    status: expenseStatus.optional(),
    isBillable: z.boolean().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    accountId: z.string().uuid().nullable().optional(),
    customerId: z.string().uuid().nullable().optional(),
    vendorName: z.string().nullable().optional(),
    receiptUrl: z.string().nullable().optional(),
    paymentMethod: expensePaymentMethod.nullable().optional(),
    notes: z.string().nullable().optional(),
    gstTreatment: gstTreatment.optional(),
    gstExemptionReason: gstExemptionReason.optional(),
    gstClaimablePercentage: percentage.optional(),
    privateUsePercentage: percentage.optional(),
  })
  .strict();

export const createExpenseRequestSchema = expenseWriteObject.refine((value) => Number(value.amount) > 0, {
  message: 'Amount must be greater than 0',
  path: ['amount'],
});

export const updateExpenseRequestSchema = expenseWriteObject.partial();

export const createExpenseCategoryRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
  })
  .strict();

export const updateExpenseCategoryRequestSchema = createExpenseCategoryRequestSchema.partial();

export const expenseListResponseSchema = z.object({
  expenses: z.array(expenseSchema),
  categories: z.array(expenseCategorySchema),
});

export type ExpenseDto = z.infer<typeof expenseSchema>;
export type ExpenseCategoryDto = z.infer<typeof expenseCategorySchema>;
export type CreateExpenseRequest = z.infer<typeof createExpenseRequestSchema>;
export type UpdateExpenseRequest = z.infer<typeof updateExpenseRequestSchema>;
export type CreateExpenseCategoryRequest = z.infer<typeof createExpenseCategoryRequestSchema>;
export type UpdateExpenseCategoryRequest = z.infer<typeof updateExpenseCategoryRequestSchema>;
export type ExpenseListResponse = z.infer<typeof expenseListResponseSchema>;
