import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { requestLogging } from './middleware/logging';
import { requestContext } from './middleware/request-context';
import { sessionRoutes } from './modules/auth/session.routes';
import { businessProfileRoutes } from './modules/business-profile/business-profile.routes';
import { customerRoutes } from './modules/customers/customers.routes';
import { expenseRoutes } from './modules/expenses/expenses.routes';
import { healthRoutes } from './modules/health/health.routes';
import { invoiceRoutes } from './modules/invoices/invoices.routes';
import { quoteRoutes } from './modules/quotes/quotes.routes';
import { itemRoutes } from './modules/items/items.routes';
import { paymentRoutes } from './modules/payments/payments.routes';
import { accountRoutes } from './modules/accounts/accounts.routes';
import { bankRoutes } from './modules/bank/bank.routes';
import { reconciliationRoutes } from './modules/reconciliation/reconciliation.routes';
import { taxRoutes } from './modules/tax/tax.routes';
import { objectRoutes } from './modules/storage/objects.routes';
import { receiptRoutes } from './modules/receipts/receipts.routes';
import { aiRoutes } from './modules/ai/ai.routes';
import { conversationRoutes } from './modules/conversations/conversations.routes';
import { journalRoutes } from './modules/journals/journals.routes';
import { getBetterAuthTrustedOrigins } from './env';
import { purchaseRoutes } from './modules/purchases/purchases.routes';
import { authorizeProtectedRequest } from './modules/auth/authorize-request';
import { organisationRoutes } from './modules/organisations/organisations.routes';
import { recurringRoutes } from './modules/recurring/recurring.routes';
import type { AppDependencies, AppEnv } from './types';

export function createApp(deps: AppDependencies = {}) {
  const app = new Hono<AppEnv>();

  app.use('*', requestContext);
  app.use('*', async (c, next) => {
    if (deps.checkDatabase) {
      c.set('checkDatabase', deps.checkDatabase);
    }
    if (deps.auth) {
      c.set('auth', deps.auth);
    }
    if (deps.db) {
      c.set('db', deps.db);
    }
    if (deps.invoiceMailer) {
      c.set('invoiceMailer', deps.invoiceMailer);
    }
    if (deps.objectStore) {
      c.set('objectStore', deps.objectStore);
    }
    if (deps.receiptScanner) {
      c.set('receiptScanner', deps.receiptScanner);
    }
    if (deps.chatCompleter) {
      c.set('chatCompleter', deps.chatCompleter);
    }
    if (deps.actorUserId) {
      c.set('actorUserId', deps.actorUserId);
    }
    if (deps.scheduleRecurringAlarm) c.set('scheduleRecurringAlarm', deps.scheduleRecurringAlarm);
    await next();
  });
  app.use('*', requestLogging);
  app.use(
    '/api/*',
    cors({
      origin: getBetterAuthTrustedOrigins(),
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['set-auth-token'],
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

  app.use('*', authorizeProtectedRequest);

  app.route('/', healthRoutes());
  app.route('/', sessionRoutes());
  app.route('/', organisationRoutes());
  app.route('/', customerRoutes());
  app.route('/', businessProfileRoutes());
  app.route('/', itemRoutes());
  app.route('/', invoiceRoutes());
  app.route('/', quoteRoutes());
  app.route('/', expenseRoutes());
  app.route('/', paymentRoutes());
  app.route('/', accountRoutes());
  app.route('/', bankRoutes());
  app.route('/', reconciliationRoutes());
  app.route('/', taxRoutes());
  app.route('/', objectRoutes());
  app.route('/', receiptRoutes());
  app.route('/', aiRoutes());
  app.route('/', conversationRoutes());
  app.route('/', journalRoutes());
  app.route('/', purchaseRoutes());
  app.route('/', recurringRoutes());

  if (process.env.NODE_ENV === 'test') {
    app.get('/api/__test/boom', () => {
      throw new Error('pg: password authentication failed for user "postgres"');
    });
  }

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}
