import { describe, expect, it } from 'vitest';
import {
  createTaxReturnRequestSchema,
  fileTaxReturnRequestSchema,
  taxReturnSchema,
} from './tax';

describe('tax contracts', () => {
  it('rejects ownership ids on tax return create', () => {
    expect(
      createTaxReturnRequestSchema.safeParse({
        periodStart: '2026-07-01',
        periodEnd: '2026-09-30',
        totalSales: '5175.00',
        totalPurchases: '79.00',
        gstOnSales: '675.00',
        gstOnPurchases: '10.30',
        netGst: '664.70',
        organisationId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
  });

  it('preserves the GST calculation and reconciliation audit snapshot', () => {
    const parsed = taxReturnSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      returnType: 'GST',
      totalSales: '1150.00',
      totalPurchases: '230.00',
      gstOnSales: '150.00',
      gstOnPurchases: '30.00',
      netGst: '120.00',
      status: 'draft',
      submittedAt: null,
      irdReference: null,
      returnData: {
        gstReturn: {
          salesDetails: {
            standardRated: 1150,
            zeroRated: 0,
            exempt: 0,
            totalSales: 1150,
            gstOnSales: 150,
          },
          purchaseDetails: {
            standardRated: 230,
            capitalGoods: 0,
            totalPurchases: 230,
            gstOnPurchases: 30,
          },
          adjustments: { badDebts: 0, otherAdjustments: 0 },
        },
        reconciliation: {
          status: 'ready',
          unreconciledTransactionCount: 0,
          figuresMatch: true,
          accounts: [],
          issues: [],
        },
      },
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
    });

    expect(parsed.returnData?.reconciliation?.status).toBe('ready');
  });

  it('requires an IRD confirmation reference when recording a filed return', () => {
    expect(fileTaxReturnRequestSchema.safeParse({ irdReference: '' }).success).toBe(false);
    expect(fileTaxReturnRequestSchema.parse({ irdReference: 'GST-2026-12345' })).toEqual({
      irdReference: 'GST-2026-12345',
    });
  });

  it('does not let create bypass the filing action', () => {
    expect(createTaxReturnRequestSchema.safeParse({
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      totalSales: '0.00',
      totalPurchases: '0.00',
      gstOnSales: '0.00',
      gstOnPurchases: '0.00',
      netGst: '0.00',
      status: 'submitted',
    }).success).toBe(false);
  });
});
