# Mobile App Testing Guide

## Test User Configuration

The mobile app tests use the **same test user** as the web app E2E tests.

### Option 1: Use Environment Variables (Recommended)

Create a `.env.test` or `.env.local` file in the mobile directory:

```bash
# Mobile test user credentials (same as web app)
EXPO_PUBLIC_TEST_EMAIL=your_test_user_email@example.com
EXPO_PUBLIC_TEST_PASSWORD=your_test_user_password
```

**OR** reuse the web app's E2E environment variables:

```bash
E2E_TEST_EMAIL=your_test_user_email@example.com
E2E_TEST_PASSWORD=your_test_user_password
```

### Option 2: Use Default Credentials

If no environment variables are set, tests will use these defaults:
- **Email**: `test@ledgercraft.com`
- **Password**: `Test123!@#`

## Creating the Test User

1. **Sign up in the app** (web or mobile) with your test credentials
2. **Verify the email** if email confirmation is enabled
3. **Complete onboarding** to create a business profile

## Running Tests

```bash
cd mobile

# Run all tests
npm test

# Run specific service test
npm test -- src/services/__tests__/businessProfileService.test.ts

# Run with coverage
npm test:coverage

# Watch mode for development
npm test:watch
```

## Test User Requirements

The test user must have:
- ✅ Active Supabase auth account
- ✅ Completed business profile (onboarding)
- ✅ No RLS policy restrictions for test data
- ⚠️ **IMPORTANT**: Use a dedicated test account, not production data!

## Troubleshooting

### "Invalid login credentials" Error

**Solution**: Create the test user account:
1. Go to your web app → Sign Up
2. Use the test credentials from your environment variables
3. Complete the onboarding process
4. Run tests again

### "Failed to authenticate test user" Error

**Possible causes:**
- Test user doesn't exist in Supabase
- Wrong email/password in environment variables
- Email not verified (if verification is required)
- Supabase URL/anon key misconfigured

**Solution**: 
1. Check `.env.local` or `.env.test` file
2. Verify credentials match a real Supabase user
3. Ensure `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set

### Tests Pass but Leave Test Data

**Solution**: Tests automatically clean up with `TEST_` prefix:
- Customers starting with `TEST_`
- Items starting with `TEST_`
- Invoices starting with `TEST_INV_`

To manually clean up, run in Supabase SQL Editor:
```sql
DELETE FROM line_items WHERE invoice_id IN (
  SELECT id FROM invoices WHERE invoice_number LIKE 'TEST_INV_%'
);
DELETE FROM invoices WHERE invoice_number LIKE 'TEST_INV_%';
DELETE FROM customers WHERE name LIKE 'TEST_%';
DELETE FROM items WHERE name LIKE 'TEST_%';
```

## Sharing Test User with Web App

Both mobile and web apps can share the same test user:

**Web app** (`.env.local`):
```bash
E2E_TEST_EMAIL=testuser@yourdomain.com
E2E_TEST_PASSWORD=YourSecurePassword123!
```

**Mobile app** (`.env.local` or `.env.test`):
```bash
# Will use web app's E2E variables if available
E2E_TEST_EMAIL=testuser@yourdomain.com
E2E_TEST_PASSWORD=YourSecurePassword123!

# OR use mobile-specific variables
EXPO_PUBLIC_TEST_EMAIL=testuser@yourdomain.com
EXPO_PUBLIC_TEST_PASSWORD=YourSecurePassword123!
```

## CI/CD Setup

For GitHub Actions or other CI/CD:

```yaml
env:
  E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
  E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}
  EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  EXPO_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

Store test credentials as repository secrets for security.

