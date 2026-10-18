import { describe, it, expect, beforeEach, vi } from 'vitest';
import { taxCalculationService } from '../taxCalculationService';
import { 
  TaxConfiguration, 
  TaxCalculationRequest, 
  TaxCalculationResult,
  TaxBreakdown 
} from '@/types/payment';

describe('TaxCalculationService', () => {
  const mockNZGSTConfig: TaxConfiguration = {
    id: 'tax-1',
    userId: 'user-123',
    countryCode: 'NZ',
    taxType: 'GST',
    taxRate: 0.15, // 15% GST
    taxName: 'GST',
    appliesToServices: true,
    appliesToGoods: true,
    effectiveFrom: '2023-01-01',
    isActive: true,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GST Calculations (Tax Inclusive)', () => {
    it('should calculate GST correctly for tax-inclusive amounts', () => {
      // Arrange
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Consulting Services',
            quantity: 1,
            unitPrice: 115.00, // Includes 15% GST
            taxable: true
          }
        ],
        taxInclusive: true
      };

      // Act
      const result = taxCalculationService.calculateTax(request, mockNZGSTConfig);

      // Assert
      expect(result.total).toBe(115.00);
      expect(result.subtotal).toBe(100.00); // 115 / 1.15
      expect(result.taxAmount).toBe(15.00);
      expect(result.taxRate).toBe(0.15);
      expect(result.taxName).toBe('GST');
    });

    it('should calculate GST for multiple tax-inclusive items', () => {
      // Arrange
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Product A',
            quantity: 2,
            unitPrice: 57.50, // $50 + GST per unit
            taxable: true
          },
          {
            description: 'Product B',
            quantity: 1,
            unitPrice: 23.00, // $20 + GST
            taxable: true
          }
        ],
        taxInclusive: true
      };

      // Act
      const result = taxCalculationService.calculateTax(request, mockNZGSTConfig);

      // Assert
      expect(result.total).toBe(138.00); // (57.50 * 2) + 23.00
      expect(result.subtotal).toBe(120.00); // 138 / 1.15
      expect(result.taxAmount).toBe(18.00); // 138 - 120
    });
  });

  describe('GST Calculations (Tax Exclusive)', () => {
    it('should calculate GST correctly for tax-exclusive amounts', () => {
      // Arrange
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Professional Services',
            quantity: 1,
            unitPrice: 100.00, // Excludes GST
            taxable: true
          }
        ],
        taxInclusive: false
      };

      // Act
      const result = taxCalculationService.calculateTax(request, mockNZGSTConfig);

      // Assert
      expect(result.subtotal).toBe(100.00);
      expect(result.taxAmount).toBe(15.00); // 100 * 0.15
      expect(result.total).toBe(115.00); // 100 + 15
      expect(result.taxRate).toBe(0.15);
    });

    it('should handle mixed taxable and non-taxable items', () => {
      // Arrange
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Taxable Service',
            quantity: 1,
            unitPrice: 100.00,
            taxable: true
          },
          {
            description: 'GST-Free Export',
            quantity: 1,
            unitPrice: 50.00,
            taxable: false
          }
        ],
        taxInclusive: false
      };

      // Act
      const result = taxCalculationService.calculateTax(request, mockNZGSTConfig);

      // Assert
      expect(result.subtotal).toBe(150.00); // 100 + 50
      expect(result.taxAmount).toBe(15.00); // Only on taxable items: 100 * 0.15
      expect(result.total).toBe(165.00); // 150 + 15
      expect(result.breakdown.lineItems).toHaveLength(2);
      expect(result.breakdown.lineItems[0].taxAmount).toBe(15.00);
      expect(result.breakdown.lineItems[1].taxAmount).toBe(0);
    });
  });

  describe('Additional Charges and Discounts', () => {
    it('should apply GST to additional charges', () => {
      // Arrange
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Main Service',
            quantity: 1,
            unitPrice: 100.00,
            taxable: true
          }
        ],
        additionalCharges: 10.00, // Delivery fee
        taxInclusive: false
      };

      // Act
      const result = taxCalculationService.calculateTax(request, mockNZGSTConfig);

      // Assert
      expect(result.subtotal).toBe(110.00); // 100 + 10
      expect(result.taxAmount).toBe(16.50); // (100 + 10) * 0.15
      expect(result.total).toBe(126.50); // 110 + 16.50
    });

    it('should apply discounts before tax calculation', () => {
      // Arrange
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Service',
            quantity: 1,
            unitPrice: 100.00,
            taxable: true
          }
        ],
        discounts: 10.00, // 10% discount
        taxInclusive: false
      };

      // Act
      const result = taxCalculationService.calculateTax(request, mockNZGSTConfig);

      // Assert
      expect(result.subtotal).toBe(90.00); // 100 - 10
      expect(result.taxAmount).toBe(13.50); // 90 * 0.15
      expect(result.total).toBe(103.50); // 90 + 13.50
    });
  });

  describe('Zero-Rated and Exempt Items', () => {
    it('should handle zero-rated GST items', () => {
      // Arrange
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Export Services',
            quantity: 1,
            unitPrice: 100.00,
            taxable: false // Zero-rated
          }
        ],
        taxInclusive: false
      };

      // Act
      const result = taxCalculationService.calculateTax(request, mockNZGSTConfig);

      // Assert
      expect(result.subtotal).toBe(100.00);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(100.00);
      expect(result.breakdown.lineItems[0].taxable).toBe(false);
    });
  });

  describe('IRD GST Return Calculations', () => {
    it('should calculate sales GST for GST return', async () => {
      // Arrange
      const salesData = [
        { amount: 115.00, taxInclusive: true, taxable: true },
        { amount: 100.00, taxInclusive: false, taxable: true },
        { amount: 50.00, taxInclusive: false, taxable: false } // Zero-rated
      ];

      // Act
      const result = await taxCalculationService.calculateGSTReturnSales(
        salesData, 
        mockNZGSTConfig
      );

      // Assert
      expect(result.totalSales).toBe(280.00); // 115 inclusive + 115 exclusive-grossed + 50 zero-rated
      expect(result.gstOnSales).toBe(30.00); // 15 (from 115 inclusive) + 15 (from 100 exclusive) + 0
      expect(result.standardRated).toBe(215.00); // 115 + 100 (taxable sales)
      expect(result.zeroRated).toBe(50.00); // Export/zero-rated
    });

    it('should calculate purchases GST for GST return', async () => {
      // Arrange
      const purchaseData = [
        { amount: 46.00, taxInclusive: true, taxable: true }, // $40 + $6 GST
        { amount: 200.00, taxInclusive: false, taxable: true }, // + $30 GST
        { amount: 100.00, taxInclusive: false, taxable: false } // No GST
      ];

      // Act
      const result = await taxCalculationService.calculateGSTReturnPurchases(
        purchaseData, 
        mockNZGSTConfig
      );

      // Assert
      expect(result.totalPurchases).toBe(376.00); // 46 inclusive + 230 exclusive-grossed + 100 exempt
      expect(result.gstOnPurchases).toBe(36.00); // 6 + 30 + 0
      expect(result.standardRated).toBe(246.00); // 46 + 200 (claimable GST)
    });

    it('should calculate net GST position', async () => {
      // Arrange
      const gstOnSales = 150.00;
      const gstOnPurchases = 100.00;

      // Act
      const netGST = taxCalculationService.calculateNetGST(gstOnSales, gstOnPurchases);

      // Assert
      expect(netGST).toBe(50.00); // GST to pay to IRD
    });

    it('should handle GST refund scenario', async () => {
      // Arrange
      const gstOnSales = 100.00;
      const gstOnPurchases = 150.00; // More GST paid than collected

      // Act
      const netGST = taxCalculationService.calculateNetGST(gstOnSales, gstOnPurchases);

      // Assert
      expect(netGST).toBe(-50.00); // GST refund due from IRD
    });
  });

  describe('Tax Configuration Edge Cases', () => {
    it('should handle missing tax configuration', () => {
      // Arrange
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Service',
            quantity: 1,
            unitPrice: 100.00,
            taxable: true
          }
        ],
        taxInclusive: false
      };

      // Act & Assert
      expect(() => {
        taxCalculationService.calculateTax(request, null);
      }).toThrow('Tax configuration is required');
    });

    it('should handle zero tax rate', () => {
      // Arrange
      const zeroTaxConfig: TaxConfiguration = {
        ...mockNZGSTConfig,
        taxRate: 0
      };

      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Service',
            quantity: 1,
            unitPrice: 100.00,
            taxable: true
          }
        ],
        taxInclusive: false
      };

      // Act
      const result = taxCalculationService.calculateTax(request, zeroTaxConfig);

      // Assert
      expect(result.subtotal).toBe(100.00);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(100.00);
    });

    it('should validate tax rate bounds', () => {
      // Arrange
      const invalidTaxConfig: TaxConfiguration = {
        ...mockNZGSTConfig,
        taxRate: 1.5 // 150% - invalid
      };

      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Service',
            quantity: 1,
            unitPrice: 100.00,
            taxable: true
          }
        ],
        taxInclusive: false
      };

      // Act & Assert
      expect(() => {
        taxCalculationService.calculateTax(request, invalidTaxConfig);
      }).toThrow('Tax rate must be between 0 and 1');
    });
  });

  describe('Rounding and Precision', () => {
    it('should round tax amounts to 2 decimal places', () => {
      // Arrange
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Service',
            quantity: 1,
            unitPrice: 33.33, // Will create rounding scenarios
            taxable: true
          }
        ],
        taxInclusive: false
      };

      // Act
      const result = taxCalculationService.calculateTax(request, mockNZGSTConfig);

      // Assert
      expect(result.subtotal).toBe(33.33);
      expect(result.taxAmount).toBe(5.00); // 33.33 * 0.15 = 4.9995 -> 5.00
      expect(result.total).toBe(38.33);
    });

    it('should handle currency precision correctly', () => {
      // Arrange
      const request: TaxCalculationRequest = {
        items: [
          {
            description: 'Service',
            quantity: 3,
            unitPrice: 10.666666, // Precise calculation
            taxable: true
          }
        ],
        taxInclusive: false
      };

      // Act
      const result = taxCalculationService.calculateTax(request, mockNZGSTConfig);

      // Assert
      expect(result.subtotal).toBe(32.00); // 3 * 10.67 rounded
      expect(result.taxAmount).toBe(4.80); // 32.00 * 0.15
      expect(result.total).toBe(36.80);
    });
  });
});