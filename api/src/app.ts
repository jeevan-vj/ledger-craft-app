import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { requestLogging } from './middleware/logging';
import { requestContext } from './middleware/request-context';
import { sessionRoutes } from './modules/auth/session.routes';
import { businessProfileRoutes } from './modules/business-profile/business-profile.routes';
import { statementRoutes, publicStatementRoutes } from './modules/customer-statements/customer-statements.routes';
import { reminderRoutes } from './modules/payment-reminders/payment-reminders.routes';
import { bankFeedRoutes } from './modules/bank-feeds/bank-feeds.routes';
import { customerRoutes } from './modules/customers/customers.routes';
import { expenseRoutes } from './modules/expenses/expenses.routes';
import { healthRoutes } from './modules/health/health.routes';
import { invoiceRoutes } from './modules/invoices/invoices.routes';
import { quoteRoutes } from './modules/quotes/quotes.routes';
import { itemRoutes } from './modules/items/items.routes';
import { paymentRoutes } from './modules/payments/payments.routes';
import { saleRoutes } from './modules/sales/sales.routes';
import { accountRoutes } from './modules/accounts/accounts.routes';
import { bankWorkspaceRoutes } from './modules/bank/bank-workspace.routes';
import { bankRoutes } from './modules/bank/bank.routes';
import { reconciliationRoutes } from './modules/reconciliation/reconciliation.routes';
import { taxRoutes } from './modules/tax/tax.routes';
import { objectRoutes } from './modules/storage/objects.routes';
import { receiptRoutes } from './modules/receipts/receipts.routes';
import { aiRoutes } from './modules/ai/ai.routes';
import { conversationRoutes } from './modules/conversations/conversations.routes';
import { journalRoutes } from './modules/journals/journals.routes';
import { accountingRoutes } from './modules/accounting/accounting.routes';
import { creditNoteRoutes } from './modules/credit-notes/credit-notes.routes';
import { getBetterAuthTrustedOrigins } from './env';
import { purchaseRoutes } from './modules/purchases/purchases.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { reportRoutes } from './modules/reports/reports.routes';
import { authorizeProtectedRequest } from './modules/auth/authorize-request';
import { organisationRoutes } from './modules/organisations/organisations.routes';
import { recurringRoutes } from './modules/recurring/recurring.routes';
import { currencyRoutes } from './modules/currency/currency.routes';
import { invoiceImportRoutes } from './modules/invoice-imports/invoice-imports.routes';
import { stripePublicRoutes, stripeRoutes } from './modules/stripe/stripe.routes';
import type { AppDependencies, AppEnv } from './types';

function setCoreDependencies(c: Context<AppEnv>, deps: AppDependencies) {
  if (deps.checkDatabase) c.set('checkDatabase', deps.checkDatabase);
  if (deps.auth) c.set('auth', deps.auth);
  if (deps.db) c.set('db', deps.db);
  if (deps.invoiceMailer) c.set('invoiceMailer', deps.invoiceMailer);
  if (deps.objectStore) c.set('objectStore', deps.objectStore);
  if (deps.fileStorage) c.set('fileStorage', deps.fileStorage);
  if (deps.receiptScanner) c.set('receiptScanner', deps.receiptScanner);
}

function setExtendedDependencies(c: Context<AppEnv>, deps: AppDependencies) {
  if (deps.chatCompleter) c.set('chatCompleter', deps.chatCompleter);
  if (deps.invoiceImportExtractor) c.set('invoiceImportExtractor', deps.invoiceImportExtractor);
  if (deps.workersAi) c.set('workersAi', deps.workersAi);
  if (deps.stripeGateway) c.set('stripeGateway', deps.stripeGateway);
  if (deps.stripeConfig) c.set('stripeConfig', deps.stripeConfig);
  if (deps.actorUserId) c.set('actorUserId', deps.actorUserId);
  if (deps.accountPreDeleteHooks) c.set('accountPreDeleteHooks', deps.accountPreDeleteHooks);
  if (deps.purgeOrganisation) c.set('purgeOrganisation', deps.purgeOrganisation);
  if (deps.removeOrganisationMembership) c.set('removeOrganisationMembership', deps.removeOrganisationMembership);
  if (deps.recurringExecutionAuthorizer) c.set('recurringExecutionAuthorizer', deps.recurringExecutionAuthorizer);
  if (deps.scheduleRecurringAlarm) c.set('scheduleRecurringAlarm', deps.scheduleRecurringAlarm);
}

export function createApp(deps: AppDependencies = {}) {
  const app = new Hono<AppEnv>();

  app.use('*', requestContext);
  app.use('*', async (c, next) => {
    setCoreDependencies(c, deps);
    setExtendedDependencies(c, deps);
    c.set('capabilities', deps.capabilities ?? {
      email: deps.invoiceMailer?.availability === 'available' ? 'available' : 'unavailable',
      ai: deps.receiptScanner || deps.workersAi ? 'available' : 'unavailable',
      stripe: deps.stripeConfig?.enabled && deps.stripeGateway ? 'available' : 'unavailable',
    });
    await next();
  });
  app.use('*', requestLogging);
  app.use(
    '/api/*',
    cors({
      origin: getBetterAuthTrustedOrigins(),
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Expected-Organisation-ID'],
      exposeHeaders: ['set-auth-token', 'Content-Disposition'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.on(['POST', 'GET'], '/api/auth/*', (c) => {
    const auth = c.get('auth');
    if (!auth) {
      return c.notFound();
    }
    return auth.handler(c.req.raw);
  });

  app.route('/', stripePublicRoutes());
  if (deps.db) app.route('/', publicStatementRoutes(async () => deps.db!));

  app.use('*', authorizeProtectedRequest);

  app.route('/', healthRoutes());
  app.route('/', sessionRoutes());
  app.route('/', organisationRoutes());
  app.route('/', statementRoutes({ mailer: deps.invoiceMailer, appUrl: deps.appUrl }));
  app.route('/', reminderRoutes({ mailer: deps.invoiceMailer }));
  app.route('/', bankFeedRoutes(deps.bankFeedConfig));
  app.route('/', customerRoutes());
  app.route('/', businessProfileRoutes());
  app.route('/', itemRoutes());
  app.route('/', invoiceRoutes());
  app.route('/', creditNoteRoutes());
  app.route('/', quoteRoutes());
  app.route('/', expenseRoutes());
  app.route('/', paymentRoutes());
  app.route('/', saleRoutes());
  app.route('/', accountRoutes());
  app.route('/', bankWorkspaceRoutes());
  app.route('/', bankRoutes());
  app.route('/', reconciliationRoutes());
  // Static financial endpoints must precede tax's generic /reports/:type.
  app.route('/', reportRoutes());
  app.route('/', taxRoutes());
  app.route('/', objectRoutes());
  app.route('/', receiptRoutes());
  app.route('/', aiRoutes());
  app.route('/', conversationRoutes());
  app.route('/', accountingRoutes());
  app.route('/', journalRoutes());
  app.route('/', purchaseRoutes());
  app.route('/', recurringRoutes());
  app.route('/', currencyRoutes());
  app.route('/', invoiceImportRoutes());
  app.route('/', stripeRoutes());
  app.route('/', dashboardRoutes());

  if (process.env.NODE_ENV === 'test') {
    app.get('/api/__test/boom', () => {
      throw new Error('pg: password authentication failed for user "postgres"');
    });
  }

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}
