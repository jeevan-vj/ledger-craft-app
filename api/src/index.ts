import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createAppDb } from './db/local';
import { apiHost, apiPort } from './env';
import { createOpenAiChatCompleter, createOpenAiReceiptScanner } from './modules/ai/openai';
import { createAuth } from './modules/auth/auth';
import { createRuntimeInvoiceMailer } from './modules/invoices/resend';
import { createFilesystemObjectStore } from './modules/storage/filesystem';
import { createFilesystemFileStorage } from './modules/storage/filesystem-file-storage';
import { stripeRuntimeFromEnv } from './modules/stripe/stripe.real-gateway';

function createRuntimeApp() {
  const { db, sql } = createAppDb();
  const auth = createAuth(db);
  const stripe = stripeRuntimeFromEnv(process.env);
  return createApp({
    auth,
    db,
    invoiceMailer: createRuntimeInvoiceMailer(),
    objectStore: createFilesystemObjectStore(),
    fileStorage: createFilesystemFileStorage(),
    receiptScanner: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY ? createOpenAiReceiptScanner() : undefined,
    chatCompleter: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY ? createOpenAiChatCompleter() : undefined,
    stripeGateway: stripe?.gateway,
    stripeConfig: stripe?.config,
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
