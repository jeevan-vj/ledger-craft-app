import { describe, it, expect } from 'vitest';
import { bankAccountService } from '../bankAccountService';

describe('Bank Account Service', () => {
  describe('validateBankAccount', () => {
    it('should validate bank account data', () => {
      const validAccount = {
        accountName: 'Test Account',
        accountNumber: '12345678',
        bankName: 'Test Bank',
        accountType: 'checking' as const,
        currency: 'NZD',
        openingBalance: 1000,
        currentBalance: 1000,
        isActive: true
      };

      expect(() => bankAccountService.validateBankAccount(validAccount))
        .not.toThrow();
    });

    it('should reject empty account name', () => {
      const invalidAccount = {
        accountName: '',
        accountNumber: '12345678',
        bankName: 'Test Bank',
        accountType: 'checking' as const,
        currency: 'NZD',
        openingBalance: 1000,
        currentBalance: 1000,
        isActive: true
      };

      expect(() => bankAccountService.validateBankAccount(invalidAccount))
        .toThrow('Account name is required');
    });

    it('should reject short account numbers', () => {
      const invalidAccount = {
        accountName: 'Test Account',
        accountNumber: '123',
        bankName: 'Test Bank',
        accountType: 'checking' as const,
        currency: 'NZD',
        openingBalance: 1000,
        currentBalance: 1000,
        isActive: true
      };

      expect(() => bankAccountService.validateBankAccount(invalidAccount))
        .toThrow('Account number must be at least 4 characters');
    });

    it('should reject invalid account types', () => {
      const invalidAccount = {
        accountName: 'Test Account',
        accountNumber: '12345678',
        bankName: 'Test Bank',
        accountType: 'invalid' as import('@/types/bankTransaction').BankAccount['accountType'],
        currency: 'NZD',
        openingBalance: 1000,
        currentBalance: 1000,
        isActive: true
      };

      expect(() => bankAccountService.validateBankAccount(invalidAccount))
        .toThrow('Invalid account type');
    });

    it('should reject negative opening balances', () => {
      const invalidAccount = {
        accountName: 'Test Account',
        accountNumber: '12345678',
        bankName: 'Test Bank',
        accountType: 'checking' as const,
        currency: 'NZD',
        openingBalance: -100,
        currentBalance: 1000,
        isActive: true
      };

      expect(() => bankAccountService.validateBankAccount(invalidAccount))
        .toThrow('Opening balance cannot be negative');
    });

    it('should allow negative balances for credit card accounts', () => {
      const creditAccount = {
        accountName: 'Credit Card',
        accountNumber: '12345678',
        bankName: 'Test Bank',
        accountType: 'credit_card' as const,
        currency: 'NZD',
        openingBalance: 0,
        currentBalance: -500, // Negative is allowed for credit cards
        isActive: true
      };

      expect(() => bankAccountService.validateBankAccount(creditAccount))
        .not.toThrow();
    });

    it('should reject negative balances for non-credit accounts', () => {
      const invalidAccount = {
        accountName: 'Test Account',
        accountNumber: '12345678',
        bankName: 'Test Bank',
        accountType: 'checking' as const,
        currency: 'NZD',
        openingBalance: 1000,
        currentBalance: -100,
        isActive: true
      };

      expect(() => bankAccountService.validateBankAccount(invalidAccount))
        .toThrow('Current balance cannot be negative for non-credit accounts');
    });

    it('should require bank name', () => {
      const invalidAccount = {
        accountName: 'Test Account',
        accountNumber: '12345678',
        bankName: '',
        accountType: 'checking' as const,
        currency: 'NZD',
        openingBalance: 1000,
        currentBalance: 1000,
        isActive: true
      };

      expect(() => bankAccountService.validateBankAccount(invalidAccount))
        .toThrow('Bank name is required');
    });

    it('should require currency', () => {
      const invalidAccount = {
        accountName: 'Test Account',
        accountNumber: '12345678',
        bankName: 'Test Bank',
        accountType: 'checking' as const,
        currency: '',
        openingBalance: 1000,
        currentBalance: 1000,
        isActive: true
      };

      expect(() => bankAccountService.validateBankAccount(invalidAccount))
        .toThrow('Currency is required');
    });
  });
});