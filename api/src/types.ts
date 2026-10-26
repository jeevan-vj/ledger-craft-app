import type { Database } from './db/client';
import type { Auth } from './modules/auth/auth';
import type { ChatCompleter } from './modules/ai/chat';
import type { ReceiptScanner } from './modules/ai/scanner';
import type { InvoiceMailer } from './modules/invoices/mailer';
import type { ObjectStore } from './modules/storage/object-store';
import type { FileStorage } from './modules/storage/file-storage';

export type AppEnv = {
  Variables: {
    requestId: string;
    actorUserId?: string;
    checkDatabase?: () => Promise<boolean>;
    auth?: Auth;
    db?: Database;
    invoiceMailer?: InvoiceMailer;
    objectStore?: ObjectStore;
    fileStorage?: FileStorage;
    receiptScanner?: ReceiptScanner;
    chatCompleter?: ChatCompleter;
    scheduleRecurringAlarm?: (timestamp: number) => Promise<void>;
  };
};

export type AppDependencies = {
  actorUserId?: string;
  checkDatabase?: () => Promise<boolean>;
  auth?: Auth;
  db?: Database;
  invoiceMailer?: InvoiceMailer;
  objectStore?: ObjectStore;
  fileStorage?: FileStorage;
  receiptScanner?: ReceiptScanner;
  chatCompleter?: ChatCompleter;
  scheduleRecurringAlarm?: (timestamp: number) => Promise<void>;
};
