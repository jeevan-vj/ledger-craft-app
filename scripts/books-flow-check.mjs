#!/usr/bin/env node
/**
 * Decide whether the Chromium books flow needs to run.
 *
 * An edit outside signup, onboarding, invoices, payments, expenses, or GST
 * prints skip and does not start a browser. A matching edit runs
 * tests/e2e/accountant-books.spec.ts. Test-only edits of other files do not.
 *
 *   node scripts/books-flow-check.mjs            # files changed in git
 *   node scripts/books-flow-check.mjs --run      # run the flow when needed
 *   node scripts/books-flow-check.mjs src/pages/Expenses.tsx
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FLOW_COMMAND = './node_modules/.bin/playwright test tests/e2e/accountant-books.spec.ts --project=chromium --retries=0';

/** Production files the signed-up bookkeeper flow actually exercises. */
const SURFACE = [
  'src/pages/ModernSignup.tsx',
  'src/pages/Onboarding.tsx',
  'src/pages/onboardingOrganisation.ts',
  'src/components/onboarding/',
  'src/components/organisations/CompanySwitcher.tsx',
  'src/features/organisations/',
  'src/pages/CreateInvoice.tsx',
  'src/components/invoice/InvoiceForm.tsx',
  'src/components/ui/customer-combobox.tsx',
  'src/components/customer/CustomerFormDrawer.tsx',
  'src/pages/PaymentsPage.tsx',
  'src/components/payment/',
  'src/pages/Expenses.tsx',
  'src/components/expense/ExpenseFormDrawer.tsx',
  'src/components/expense/includedGst.ts',
  'src/components/ui/toast.tsx',
  'src/components/ui/button.tsx',
  'src/components/ui/input.tsx',
  'src/components/ui/dialog.tsx',
  'src/components/ui/drawer.tsx',
  'src/components/ui/select.tsx',
  'src/components/ui/form.tsx',
  'src/components/ui/label.tsx',
  'src/components/ui/EmptyState.tsx',
  'src/components/common/PwaUpdatePrompt.tsx',
  'src/hooks/useAppData.ts',
  'src/context/StableAuthContext.tsx',
  'src/services/taxCalculationService.ts',
  'src/utils/countryTaxDefaults.ts',
  'api/src/modules/invoices/invoices.service.ts',
  'api/src/modules/invoices/invoices.routes.ts',
  'api/src/modules/invoices/invoices.repository.ts',
  'api/src/modules/invoices/totals.ts',
  'api/src/modules/invoices/money.ts',
  'api/src/modules/invoices/gst-compliance.ts',
  'api/src/modules/invoices/numbering.ts',
  'api/src/modules/payments/',
  'api/src/modules/expenses/',
  'api/src/modules/customers/',
  'api/src/modules/business-profile/',
  'api/src/modules/organisations/',
  'api/src/modules/auth/provision.ts',
  'api/src/modules/auth/auth.ts',
  'api/src/modules/auth/get-me.ts',
  'packages/contracts/src/gst-settings.ts',
  'packages/contracts/src/expense.ts',
  'tests/e2e/accountant-books.spec.ts',
];

export function repoRootFrom(metaUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), '..');
}

export function normalizeRepoPath(file) {
  return file.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function isOtherTest(file) {
  return file !== 'tests/e2e/accountant-books.spec.ts' && /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

export function matchesBooksFlow(file) {
  const normalized = normalizeRepoPath(file);
  if (isOtherTest(normalized)) return false;
  return SURFACE.some((rule) => (rule.endsWith('/') ? normalized.startsWith(rule) : normalized === rule));
}

export function classifyBooksTouch(files) {
  const matches = [...new Set(files.map(normalizeRepoPath).filter(matchesBooksFlow))];
  if (matches.length === 0) {
    return {
      decision: 'skip',
      matches,
      command: null,
      reason: 'no signup, onboarding, invoice, payment, expense, or GST file in this change',
    };
  }
  return {
    decision: 'run',
    matches,
    command: FLOW_COMMAND,
    reason: matches.join(', '),
  };
}

export function filesFromPorcelain(text) {
  return text.split('\n').flatMap((line) => {
    if (line.length < 4) return [];
    const file = line.slice(3).split(' -> ').pop().trim();
    return file ? [file] : [];
  });
}

function changedFiles(root) {
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (status.status !== 0) {
    throw new Error(status.stderr.trim() || 'git status failed');
  }
  return filesFromPorcelain(status.stdout);
}

function printDecision(decision) {
  console.log(`books-flow: ${decision.decision}`);
  console.log(`reason: ${decision.reason}`);
  if (decision.command) console.log(`command: ${decision.command}`);
}

function main(argv, root) {
  const run = argv.includes('--run');
  const requested = argv.filter((arg) => arg !== '--run');
  const files = requested.length > 0 ? requested : changedFiles(root);
  const decision = classifyBooksTouch(files);
  printDecision(decision);
  if (!run || decision.decision === 'skip') return 0;
  const child = spawnSync(decision.command, {
    cwd: root,
    shell: true,
    stdio: 'inherit',
  });
  return child.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2), repoRootFrom()));
}
