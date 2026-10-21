import type { Database } from './db/client';
import type { Auth } from './modules/auth/auth';
import type { ChatCompleter } from './modules/ai/chat';
import type { ReceiptScanner } from './modules/ai/scanner';
import type { InvoiceMailer } from './modules/invoices/mailer';
import type { ObjectStore } from './modules/storage/object-store';

export type AppEnv = {
  Variables: {
    requestId: string;
    actorUserId?: string;
    checkDatabase?: () => Promise<boolean>;
    auth?: Auth;
    db?: Database;
    invoiceMailer?: InvoiceMailer;
    objectStore?: ObjectStore;
    receiptScanner?: ReceiptScanner;
    chatCompleter?: ChatCompleter;
  };
};

export type AppDependencies = {
  actorUserId?: string;
  checkDatabase?: () => Promise<boolean>;
  auth?: Auth;
  db?: Database;
  invoiceMailer?: InvoiceMailer;
  objectStore?: ObjectStore;
  receiptScanner?: ReceiptScanner;
  chatCompleter?: ChatCompleter;
};
