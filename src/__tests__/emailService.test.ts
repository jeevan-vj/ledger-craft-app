import { describe, it, expect } from 'vitest';
import { emailService } from '../services/emailService';

describe('EmailService', () => {
  describe('validateEmail', () => {
    it('should validate correct email addresses', async () => {
      const validEmails = [
        'test@example.com',
        'user+tag@domain.co.uk',
        'first.last@subdomain.example.org'
      ];

      for (const email of validEmails) {
        const result = await emailService.validateEmail(email);
        expect(result).toBe(true);
      }
    });

    it('should reject invalid email addresses', async () => {
      const invalidEmails = [
        'invalid',
        '@domain.com',
        'user@',
        'user.domain.com',
        ''
      ];

      for (const email of invalidEmails) {
        const result = await emailService.validateEmail(email);
        expect(result).toBe(false);
      }
    });
  });
});