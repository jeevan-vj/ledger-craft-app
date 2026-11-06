import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SalePaymentMethod } from '@ledgercraft/contracts';
import { emptySaleDraft, type SaleDraft, type SaleLine } from './saleCart';

const ENABLED_KEY = 'ledgercraft.quickSale.enabled';
const DRAFT_KEY = 'ledgercraft.quickSale.draft';
const ATTEMPT_KEY = 'ledgercraft.quickSale.attempt';

const METHODS = new Set<SalePaymentMethod>(['cash', 'credit_card', 'bank_transfer']);

async function read(key: string): Promise<string | null> {
  return Platform.OS === 'web' ? globalThis.localStorage.getItem(key) : SecureStore.getItemAsync(key);
}
async function write(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') globalThis.localStorage.setItem(key, value);
  else await SecureStore.setItemAsync(key, value);
}
async function remove(key: string): Promise<void> {
  if (Platform.OS === 'web') globalThis.localStorage.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}

export interface StoredSaleAttempt {
  fingerprint: string;
  key: string;
  paymentMethod: SalePaymentMethod;
  referenceNumber: string;
  tendered: string;
  keys: Record<string, string>;
}

function isLine(value: unknown): value is SaleLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as SaleLine;
  if (typeof line.quantity !== 'string' || typeof line.price !== 'string') return false;
  if (line.kind === 'catalog') return typeof line.itemId === 'string' && typeof line.name === 'string';
  if (line.kind === 'custom') return typeof line.id === 'string' && typeof line.label === 'string';
  return false;
}

export async function loadQuickSaleEnabled(): Promise<boolean> {
  return (await read(ENABLED_KEY)) === '1';
}

export async function saveQuickSaleEnabled(enabled: boolean): Promise<void> {
  if (enabled) await write(ENABLED_KEY, '1');
  else await remove(ENABLED_KEY);
}

export async function loadSaleDraft(): Promise<SaleDraft> {
  const value = await read(DRAFT_KEY);
  if (!value) return emptySaleDraft();
  try {
    const parsed = JSON.parse(value) as Partial<SaleDraft>;
    if (!parsed || !Array.isArray(parsed.lines) || !parsed.lines.every(isLine)) return emptySaleDraft();
    return {
      lines: parsed.lines,
      customerId: typeof parsed.customerId === 'string' ? parsed.customerId : null,
      customerName: typeof parsed.customerName === 'string' ? parsed.customerName : null,
    };
  } catch {
    return emptySaleDraft();
  }
}

export async function saveSaleDraft(draft: SaleDraft): Promise<void> {
  await write(DRAFT_KEY, JSON.stringify(draft));
}

export async function loadSaleAttempt(): Promise<StoredSaleAttempt | null> {
  const value = await read(ATTEMPT_KEY);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredSaleAttempt>;
    if (!parsed || typeof parsed.fingerprint !== 'string' || typeof parsed.key !== 'string') return null;
    if (!parsed.paymentMethod || !METHODS.has(parsed.paymentMethod)) return null;
    const keys: Record<string, string> = {};
    if (parsed.keys && typeof parsed.keys === 'object') {
      for (const [fingerprint, key] of Object.entries(parsed.keys)) {
        if (fingerprint && typeof key === 'string' && key) keys[fingerprint] = key;
      }
    }
    keys[parsed.fingerprint] = parsed.key;
    return {
      fingerprint: parsed.fingerprint,
      key: parsed.key,
      paymentMethod: parsed.paymentMethod,
      referenceNumber: typeof parsed.referenceNumber === 'string' ? parsed.referenceNumber : '',
      tendered: typeof parsed.tendered === 'string' ? parsed.tendered : '',
      keys,
    };
  } catch {
    return null;
  }
}

export async function saveSaleAttempt(attempt: StoredSaleAttempt): Promise<void> {
  const keys = { ...attempt.keys, [attempt.fingerprint]: attempt.key };
  await write(ATTEMPT_KEY, JSON.stringify({ ...attempt, keys }));
}

export async function clearSaleAttempt(): Promise<void> {
  await remove(ATTEMPT_KEY);
}
