import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createAppDb } from './db/local';
import { apiHost, apiPort } from './env';
import { createOpenAiChatCompleter, createOpenAiReceiptScanner } from './modules/ai/openai';
import { createAuth } from './modules/auth/auth';
import { createAuthEmailSender } from './modules/auth/auth-email';
import { purgeLocalOrganisationData } from './modules/auth/local-organisation-purge';
import { createRuntimeInvoiceMailer } from './modules/invoices/resend';
import { createFilesystemObjectStore } from './modules/storage/filesystem';
import { createFilesystemFileStorage } from './modules/storage/filesystem-file-storage';
import { bankFeedConfigFromEnv, bankFeedPreDeleteHook } from './modules/bank-feeds/bank-feeds.service';
import { stripePaymentsCapability, stripeRuntimeFromEnv } from './modules/stripe/stripe.real-gateway';

function createRuntimeApp() {
  const { db, sql } = createAppDb();
  const auth = createAuth(db, { sendAuthEmail: createAuthEmailSender({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
  }) });
  const stripe = stripeRuntimeFromEnv(process.env);
  const invoiceMailer = createRuntimeInvoiceMailer();
  const objectStore = createFilesystemObjectStore();
  const fileStorage = createFilesystemFileStorage();
  return createApp({
    auth,
    db,
    appUrl: process.env.APP_URL,
    bankFeedConfig: bankFeedConfigFromEnv(process.env),
    accountPreDeleteHooks: [bankFeedPreDeleteHook(db, bankFeedConfigFromEnv(process.env))],
    invoiceMailer,
    objectStore,
    fileStorage,
    purgeOrganisation: (organisationId) => purgeLocalOrganisationData(db, { objectStore, fileStorage }, organisationId),
    receiptScanner: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY ? createOpenAiReceiptScanner() : undefined,
    chatCompleter: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY ? createOpenAiChatCompleter() : undefined,
    stripeGateway: stripe?.gateway,
    stripeConfig: stripe?.config,
    capabilities: {
      email: invoiceMailer.availability ?? 'unavailable',
      ai: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY ? 'available' : 'unavailable',
      stripe: stripePaymentsCapability(process.env),
      assistant: process.env.ASSISTANT_ENABLED === '1' ? 'available' : 'unavailable',
    },
    checkDatabase: async () => {
      try {
        await sql`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    },
  });
}

serve({ fetch: createRuntimeApp().fetch, port: apiPort, hostname: apiHost }, (info) => {
  console.log(JSON.stringify({ msg: 'api_listen', host: info.address, port: info.port }));
});
