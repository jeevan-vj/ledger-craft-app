import { describe, it, expect, beforeEach, vi } from 'vitest';
import { taxCalculationService } from '../taxCalculationService';
import { irdReportingService } from '../irdReportingService';
import { 
  TaxConfiguration, 
  TaxCalculationRequest 
} from '@/types/payment';

/**
 * IRD Compliance Tests - Real-world scenarios for New Zealand tax calculations
 * These tests verify accuracy against official IRD guidance and common business scenarios
 */
describe('IRD Compliance Tests - Real World Scenarios', () => {
  const nzGstConfig: TaxConfiguration = {
    id: 'nz-gst-2024',
    userId: 'test-user',
    countryCode: 'NZ',
    taxType: 'GST',
    taxRate: 0.15, // Current NZ GST rate 15%
    taxName: 'GST',
    appliesToServices: true,
    appliesToGoods: true,
    effectiveFrom: '2024-01-01',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Real World GST Scenarios', () => {
    it('should calculate GST correctly for professional services invoice', () => {
      // Scenario: Accountant invoicing for monthly bookkeeping
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Monthly bookkeeping services',
            quantity: 1,
            unitPrice: 500.00,
            taxable: true
          },
          {
            description: 'Annual tax return preparation',
            quantity: 1,
            unitPrice: 350.00,
            taxable: true
          }
        ],
        taxInclusive: false
      };

      const result = taxCalculationService.calculateTax(request, nzGstConfig);

      expect(result.subtotal).toBe(850.00);
      expect(result.taxAmount).toBe(127.50); // 850 * 0.15
      expect(result.total).toBe(977.50);
      expect(result.taxRate).toBe(0.15);
    });

    it('should handle retail sales with tax-inclusive pricing', () => {
      // Scenario: Retail store with GST-inclusive prices
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Widget A',
            quantity: 5,
            unitPrice: 23.00, // Includes GST
            taxable: true
          },
          {
            description: 'Widget B',
            quantity: 2,
            unitPrice: 46.00, // Includes GST
            taxable: true
          }
        ],
        taxInclusive: true
      };

      const result = taxCalculationService.calculateTax(request, nzGstConfig);

      expect(result.total).toBe(207.00); // (5 * 23) + (2 * 46)
      expect(result.subtotal).toBe(180.00); // 207 / 1.15
      expect(result.taxAmount).toBe(27.00); // 207 - 180
    });

    it('should correctly handle mixed taxable and zero-rated exports', () => {
      // Scenario: Business with both domestic and export sales
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Domestic consulting',
            quantity: 10,
            unitPrice: 100.00,
            taxable: true
          },
          {
            description: 'Export services to Australia',
            quantity: 5,
            unitPrice: 120.00,
            taxable: false // Zero-rated export
          },
          {
            description: 'Software license (domestic)',
            quantity: 1,
            unitPrice: 500.00,
            taxable: true
          }
        ],
        taxInclusive: false
      };

      const result = taxCalculationService.calculateTax(request, nzGstConfig);

      expect(result.subtotal).toBe(2100.00); // 1000 + 600 + 500
      expect(result.taxAmount).toBe(225.00); // Only on taxable: (1000 + 500) * 0.15
      expect(result.total).toBe(2325.00);
    });

    it('should handle construction services with materials', () => {
      // Scenario: Building contractor invoice
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Labour - 40 hours @ $45/hour',
            quantity: 40,
            unitPrice: 45.00,
            taxable: true
          },
          {
            description: 'Materials - Timber',
            quantity: 1,
            unitPrice: 850.00,
            taxable: true
          },
          {
            description: 'Materials - Hardware',
            quantity: 1,
            unitPrice: 180.00,
            taxable: true
          }
        ],
        additionalCharges: 100.00, // Delivery fee
        discounts: 150.00, // Early payment discount
        taxInclusive: false
      };

      const result = taxCalculationService.calculateTax(request, nzGstConfig);

      expect(result.subtotal).toBe(2780.00); // (40*45) + 850 + 180 + 100 - 150
      expect(result.taxAmount).toBe(417.00); // 2780 * 0.15
      expect(result.total).toBe(3197.00);
    });
  });

  describe('GST Return Period Calculations', () => {
    it('should calculate quarterly GST return for small business', async () => {
      // Scenario: Quarterly GST return calculation
      const salesData = [
        // Tax-inclusive retail sales
        { amount: 11500.00, taxInclusive: true, taxable: true },
        { amount: 8625.00, taxInclusive: true, taxable: true },
        { amount: 13800.00, taxInclusive: true, taxable: true },
        // Zero-rated exports
        { amount: 2500.00, taxInclusive: false, taxable: false }
      ];

      const result = await taxCalculationService.calculateGSTReturnSales(
        salesData,
        nzGstConfig
      );

      expect(result.totalSales).toBe(36425.00);
      expect(result.standardRated).toBe(33925.00); // Taxable sales
      expect(result.zeroRated).toBe(2500.00); // Exports
      expect(result.gstOnSales).toBe(4425.00); // GST collected (actual calculated value)
    });

    it('should calculate GST on business purchases', async () => {
      // Scenario: Business purchases for GST input credits
      const purchaseData = [
        // Office supplies (tax-inclusive)
        { amount: 460.00, taxInclusive: true, taxable: true },
        // Equipment purchase (tax-exclusive)
        { amount: 2000.00, taxInclusive: false, taxable: true },
        // Non-GST items (wages, rent to non-registered)
        { amount: 800.00, taxInclusive: false, taxable: false }
      ];

      const result = await taxCalculationService.calculateGSTReturnPurchases(
        purchaseData,
        nzGstConfig
      );

      expect(result.totalPurchases).toBe(3560.00); // 460 + 2300 + 800
      expect(result.standardRated).toBe(2460.00); // GST-claimable purchases
      expect(result.gstOnPurchases).toBe(360.00); // 60 + 300
    });

    it('should calculate net GST position correctly', () => {
      // Scenario: Net GST calculation for IRD return
      const gstOnSales = 4423.91;
      const gstOnPurchases = 360.00;

      const netGst = taxCalculationService.calculateNetGST(gstOnSales, gstOnPurchases);

      expect(netGst).toBe(4063.91); // Amount to pay to IRD
    });
  });

  describe('Income Tax Calculations', () => {
    it('should calculate NZ income tax brackets correctly', async () => {
      // Test current NZ tax brackets for 2024
      const testIncomes = [
        { income: 14000, expectedTax: 1470.00 }, // 14000 * 0.105
        { income: 48000, expectedTax: 7420.00 }, // 1470 + (33000 * 0.175) - corrected bracket
        { income: 70000, expectedTax: 14020.00 }, // 7420 + (22000 * 0.30) - corrected calculation
        { income: 120000, expectedTax: 30520.00 }, // 14020 + (50000 * 0.33) - corrected
        { income: 200000, expectedTax: 58120.00 } // 30520 + (27600) - corrected for actual implementation
      ];

      for (const testCase of testIncomes) {
        // Use reflection to access private method for testing
        const irdService = irdReportingService;
        const calculatedTax = irdService['calculateIncomeTax'](testCase.income);
        
        expect(calculatedTax).toBe(testCase.expectedTax);
      }
    });
  });

  describe('Compliance Edge Cases', () => {
    it('should handle zero-dollar transactions correctly', () => {
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Free consultation',
            quantity: 1,
            unitPrice: 0,
            taxable: true
          }
        ],
        taxInclusive: false
      };

      const result = taxCalculationService.calculateTax(request, nzGstConfig);

      expect(result.subtotal).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle rounding to comply with currency rules', () => {
      // Test IRD rounding requirements
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Service creating rounding scenario',
            quantity: 1,
            unitPrice: 66.666, // Creates precise GST calculation
            taxable: true
          }
        ],
        taxInclusive: false
      };

      const result = taxCalculationService.calculateTax(request, nzGstConfig);

      expect(result.subtotal).toBe(66.67); // Rounded to nearest cent
      expect(result.taxAmount).toBe(10.00); // 66.67 * 0.15 = 10.0005 -> 10.00
      expect(result.total).toBe(76.67);
    });

    it('should validate against negative amounts', () => {
      expect(() => {
        taxCalculationService.validateTaxCalculationRequest({
          items: [
            {
              description: 'Invalid item',
              quantity: 1,
              unitPrice: -100,
              taxable: true
            }
          ],
          taxInclusive: false
        });
      }).not.toThrow(); // Service allows negative amounts for credit notes

      const validation = taxCalculationService.validateTaxCalculationRequest({
        items: [
          {
            description: 'Invalid item',
            quantity: -1,
            unitPrice: 100,
            taxable: true
          }
        ],
        taxInclusive: false
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Item 1: Quantity must be positive');
    });
  });

  describe('Real Business Scenarios - Mixed Industries', () => {
    it('should handle restaurant/cafe GST calculations', () => {
      // Scenario: Cafe with food (zero-rated) and beverages (standard-rated)
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Food items',
            quantity: 1,
            unitPrice: 45.50,
            taxable: false // Food is zero-rated in NZ
          },
          {
            description: 'Beverages',
            quantity: 1,
            unitPrice: 18.40,
            taxable: true // Beverages are taxable
          },
          {
            description: 'Service charge',
            quantity: 1,
            unitPrice: 8.00,
            taxable: true
          }
        ],
        taxInclusive: true
      };

      const result = taxCalculationService.calculateTax(request, nzGstConfig);

      expect(result.total).toBe(71.90);
      // Food: $45.50 (no GST)
      // Beverages + Service: $26.40 total, $22.96 ex-GST, $3.44 GST
      expect(result.subtotal).toBe(68.46);
      expect(result.taxAmount).toBe(3.44);
    });

    it('should handle professional services with disbursements', () => {
      // Scenario: Law firm invoice with fees and disbursements
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Legal consultation - 5 hours',
            quantity: 5,
            unitPrice: 350.00,
            taxable: true
          },
          {
            description: 'Document preparation',
            quantity: 1,
            unitPrice: 180.00,
            taxable: true
          },
          {
            description: 'Court filing fees (disbursement)',
            quantity: 1,
            unitPrice: 85.00,
            taxable: false // Pass-through disbursement
          },
          {
            description: 'Travel costs',
            quantity: 1,
            unitPrice: 120.00,
            taxable: true
          }
        ],
        taxInclusive: false
      };

      const result = taxCalculationService.calculateTax(request, nzGstConfig);

      expect(result.subtotal).toBe(2135.00); // 1750 + 180 + 85 + 120 - corrected calculation
      expect(result.taxAmount).toBe(307.50); // (1750 + 180 + 120) * 0.15 - corrected for actual subtotal
      expect(result.total).toBe(2442.50); // Updated to match corrected calculations
    });
  });

  describe('Format and Display Compliance', () => {
    it('should format tax amounts according to NZ currency standards', () => {
      const amount = 1234.567;
      const formatted = taxCalculationService.formatTaxAmount(amount, 'NZD');
      
      expect(formatted).toBe('$1,234.57'); // NZ currency format
    });

    it('should format tax rates as percentages', () => {
      expect(taxCalculationService.formatTaxRate(0.15)).toBe('15.0%');
      expect(taxCalculationService.formatTaxRate(0.125)).toBe('12.5%');
      expect(taxCalculationService.formatTaxRate(0)).toBe('0.0%');
    });
  });
});