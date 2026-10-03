import { z } from 'zod';

const money = z.string().regex(/^-?\d+(\.\d+)?$/);

export const gstReconciliationSnapshotSchema = z.object({
  status: z.enum(['ready', 'warning', 'not_applicable']),
  unreconciledTransactionCount: z.number().int().nonnegative(),
  figuresMatch: z.boolean(),
  accounts: z.array(z.object({
    accountId: z.string().min(1),
    accountName: z.string().min(1),
    status: z.enum(['complete', 'partial', 'in_progress', 'missing']),
    sessionId: z.string().nullable(),
  })),
  issues: z.array(z.string()),
  acknowledgedAt: z.string().optional(),
});

export const irdReturnDataSchema = z.object({
  gstReturn: z.object({
    salesDetails: z.object({
      standardRated: z.number(),
      zeroRated: z.number(),
      exempt: z.number(),
      totalSales: z.number(),
      gstOnSales: z.number(),
    }),
    purchaseDetails: z.object({
      standardRated: z.number(),
      capitalGoods: z.number(),
      totalPurchases: z.number(),
      gstOnPurchases: z.number(),
    }),
    adjustments: z.object({
      badDebts: z.number(),
      otherAdjustments: z.number(),
    }).optional(),
  }).optional(),
  reconciliation: gstReconciliationSnapshotSchema.optional(),
  incomeTax: z.object({
    grossIncome: z.number(),
    allowableDeductions: z.number(),
    taxableIncome: z.number(),
    taxDue: z.number(),
    provisionalTax: z.number(),
  }).optional(),
});

export const taxConfigurationSchema = z.object({
  id: z.string().uuid(),
  countryCode: z.string().min(1),
  taxType: z.enum(['GST', 'VAT', 'Sales_Tax']),
  taxRate: money,
  taxName: z.string().min(1),
  appliesToServices: z.boolean(),
  appliesToGoods: z.boolean(),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const upsertTaxConfigurationRequestSchema = z
  .object({
    countryCode: z.string().min(1).optional(),
    taxType: z.enum(['GST', 'VAT', 'Sales_Tax']).optional(),
    taxRate: money.optional(),
    taxName: z.string().min(1).optional(),
    appliesToServices: z.boolean().optional(),
    appliesToGoods: z.boolean().optional(),
    effectiveFrom: z.string().min(1).optional(),
    effectiveTo: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const taxReturnSchema = z.object({
  id: z.string().uuid(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  returnType: z.enum(['GST', 'Income_Tax', 'PAYE']),
  totalSales: money,
  totalPurchases: money,
  gstOnSales: money,
  gstOnPurchases: money,
  netGst: money,
  status: z.enum(['draft', 'submitted', 'approved', 'rejected']),
  submittedAt: z.string().nullable(),
  irdReference: z.string().nullable(),
  returnData: irdReturnDataSchema.nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createTaxReturnRequestSchema = z
  .object({
    periodStart: z.string().min(1),
    periodEnd: z.string().min(1),
    returnType: z.enum(['GST', 'Income_Tax', 'PAYE']).optional(),
    totalSales: money,
    totalPurchases: money,
    gstOnSales: money,
    gstOnPurchases: money,
    netGst: money,
    status: z.literal('draft').optional(),
    irdReference: z.string().nullable().optional(),
    returnData: irdReturnDataSchema.nullable().optional(),
  })
  .strict();

export const updateTaxReturnRequestSchema = createTaxReturnRequestSchema.partial();

export const fileTaxReturnRequestSchema = z.object({
  irdReference: z.string().trim().min(1).max(100),
}).strict();

export const taxReturnListResponseSchema = z.object({
  taxReturns: z.array(taxReturnSchema),
});

export type TaxConfigurationDto = z.infer<typeof taxConfigurationSchema>;
export type UpsertTaxConfigurationRequest = z.infer<typeof upsertTaxConfigurationRequestSchema>;
export type TaxReturnDto = z.infer<typeof taxReturnSchema>;
export type CreateTaxReturnRequest = z.infer<typeof createTaxReturnRequestSchema>;
export type UpdateTaxReturnRequest = z.infer<typeof updateTaxReturnRequestSchema>;
export type TaxReturnListResponse = z.infer<typeof taxReturnListResponseSchema>;
export type FileTaxReturnRequest = z.infer<typeof fileTaxReturnRequestSchema>;
