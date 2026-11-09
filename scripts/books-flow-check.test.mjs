import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyBooksTouch, filesFromPorcelain, matchesBooksFlow } from './books-flow-check.mjs';

test('a docs or mobile edit does not start the books browser', () => {
  const decision = classifyBooksTouch([
    'docs/agent/TEST_MATRIX.md',
    'mobile/app.json',
    'src/pages/Quotes.tsx',
    'api/src/modules/reconciliation/reconciliation.service.ts',
  ]);
  assert.equal(decision.decision, 'skip');
  assert.equal(decision.command, null);
});

test('an expense form edit runs the Chromium books flow', () => {
  const decision = classifyBooksTouch(['src/components/expense/ExpenseFormDrawer.tsx']);
  assert.equal(decision.decision, 'run');
  assert.match(decision.command, /accountant-books\.spec\.ts --project=chromium/);
  assert.deepEqual(decision.matches, ['src/components/expense/ExpenseFormDrawer.tsx']);
});

test('a unit test beside the flow does not run the browser', () => {
  assert.equal(matchesBooksFlow('api/src/modules/expenses/expenses.test.ts'), false);
  assert.equal(matchesBooksFlow('api/src/modules/payments/payments.service.ts'), true);
  assert.equal(classifyBooksTouch(['api/src/modules/expenses/expenses.test.ts']).decision, 'skip');
});

test('editing the books spec itself runs it', () => {
  assert.equal(classifyBooksTouch(['tests/e2e/accountant-books.spec.ts']).decision, 'run');
});

test('porcelain names the changed file and ignores a rename arrow', () => {
  const files = filesFromPorcelain(' M src/pages/Onboarding.tsx\n?? tests/e2e/accountant-books.spec.ts\nR  old.tsx -> src/pages/Expenses.tsx\n');
  assert.deepEqual(files, [
    'src/pages/Onboarding.tsx',
    'tests/e2e/accountant-books.spec.ts',
    'src/pages/Expenses.tsx',
  ]);
});
