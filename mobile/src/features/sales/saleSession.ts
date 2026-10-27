import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { SalePaymentMethod } from '@ledgercraft/contracts';
import { onlineManager } from '@tanstack/react-query';
import type { CatalogItem } from '@/features/items/api/itemsApi';
import { randomId } from '@/utils/id';
import {
  addCatalogItem,
  addCustomAmount,
  cartTotal,
  cashChange,
  emptySaleDraft,
  pushKeypadKey,
  removeLine,
  saleFingerprint,
  saleRequestBody,
  setLinePrice,
  setLineQuantity,
  type SaleDraft,
} from './saleCart';
import {
  claimSaleAttempt,
  discardSaleAttempt,
  finishSaleAttempt,
  hydrateSaleAttempt,
  mapSaleError,
  OFFLINE_SALE_MESSAGE,
  releaseSaleAttempt,
  resetSaleAttemptForTests,
  SALE_IN_FLIGHT_MESSAGE,
  saleAttemptInFlight,
} from './saleAttempt';
import {
  clearSaleAttempt,
  loadSaleAttempt,
  loadSaleDraft,
  saveSaleAttempt,
  saveSaleDraft,
} from './saleStorage';
import { createSale, saleReceiptHandoff, type SaleReceiptHandoff } from './salesApi';

export interface SaleUiState {
  ready: boolean;
  draft: SaleDraft;
  chargeOpen: boolean;
  cartOpen: boolean;
  customOpen: boolean;
  customerOpen: boolean;
  quantityKey: string | null;
  paymentMethod: SalePaymentMethod;
  referenceNumber: string;
  tendered: string;
  submitting: boolean;
  formError: string | null;
  actionError: string | null;
  completed: SaleReceiptHandoff | null;
}

const listeners = new Set<() => void>();
let hydrateTask: Promise<void> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

function initialState(): SaleUiState {
  return {
    ready: false,
    draft: emptySaleDraft(),
    chargeOpen: false,
    cartOpen: false,
    customOpen: false,
    customerOpen: false,
    quantityKey: null,
    paymentMethod: 'cash',
    referenceNumber: '',
    tendered: '',
    submitting: false,
    formError: null,
    actionError: null,
    completed: null,
  };
}

let state: SaleUiState = initialState();

function emit() {
  for (const listener of listeners) listener();
}

function update(patch: Partial<SaleUiState>) {
  state = { ...state, ...patch };
  emit();
}

function bindAppState() {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', (next) => {
    if (next === 'background' || next === 'inactive') void saveSaleDraft(state.draft);
  });
}

export function getSaleUiState(): SaleUiState {
  return state;
}

export function subscribeSaleUi(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSaleUi(): SaleUiState {
  const [, setVersion] = useState(0);
  useEffect(() => subscribeSaleUi(() => setVersion((version) => version + 1)), []);
  const current = getSaleUiState();
  return { ...current, submitting: current.submitting || saleAttemptInFlight() };
}

export function resetSaleSessionForTests() {
  hydrateTask = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  resetSaleAttemptForTests();
  state = initialState();
  listeners.clear();
}

export async function hydrateSaleSession(): Promise<void> {
  if (state.ready) return;
  bindAppState();
  if (!hydrateTask) {
    hydrateTask = (async () => {
      try {
        const [draft, attempt] = await Promise.all([loadSaleDraft(), loadSaleAttempt()]);
        hydrateSaleAttempt(attempt ? { fingerprint: attempt.fingerprint, key: attempt.key } : null);
        update({
          ready: true,
          draft,
          paymentMethod: attempt?.paymentMethod ?? 'cash',
          referenceNumber: attempt?.referenceNumber ?? '',
          tendered: attempt?.tendered ?? '',
        });
      } catch {
        update({ ready: true });
      }
    })();
  }
  await hydrateTask;
}

function commitDraft(draft: SaleDraft, patch: Partial<SaleUiState> = {}): boolean {
  if (saleAttemptInFlight()) {
    update({ actionError: SALE_IN_FLIGHT_MESSAGE });
    return false;
  }
  update({ ...patch, draft, actionError: null });
  void saveSaleDraft(draft);
  return true;
}

export function addCatalogItemToDraft(item: CatalogItem) {
  const result = addCatalogItem(state.draft, item);
  if (result.error) {
    update({ actionError: result.error });
    return;
  }
  commitDraft(result.draft);
}

export function updateSaleLineQuantity(key: string, quantity: string): string | null {
  const result = setLineQuantity(state.draft, key, quantity);
  if (result.error) return result.error;
  if (!commitDraft(result.draft, { quantityKey: null })) return SALE_IN_FLIGHT_MESSAGE;
  return null;
}

export function updateSaleLinePrice(key: string, price: string): string | null {
  const result = setLinePrice(state.draft, key, price);
  if (result.error) return result.error;
  if (!commitDraft(result.draft, { quantityKey: null })) return SALE_IN_FLIGHT_MESSAGE;
  return null;
}

export function removeSaleLine(key: string) {
  commitDraft(removeLine(state.draft, key), { quantityKey: null });
}

export function addCustomAmountToDraft(amount: string, label: string): string | null {
  const result = addCustomAmount(state.draft, amount, label, randomId());
  if (result.error) return result.error;
  if (!commitDraft(result.draft, { customOpen: false })) return SALE_IN_FLIGHT_MESSAGE;
  return null;
}

export function setSaleCustomer(customer: { id: string; name: string; tags?: string[] | null } | null) {
  const walkIn = customer?.tags?.includes('walk-in') === true;
  const next = walkIn || !customer ? null : customer;
  commitDraft({
    ...state.draft,
    customerId: next?.id ?? null,
    customerName: next?.name ?? null,
  }, { customerOpen: false });
}

export function setSalePaymentMethod(paymentMethod: SalePaymentMethod) {
  if (saleAttemptInFlight()) return;
  update({ paymentMethod });
}

export function setSaleReference(referenceNumber: string) {
  if (saleAttemptInFlight()) return;
  update({ referenceNumber });
}

export function setSaleTendered(tendered: string) {
  if (saleAttemptInFlight()) return;
  update({ tendered });
}

export function pushSaleTenderedKey(key: string) {
  if (saleAttemptInFlight()) return;
  update({ tendered: pushKeypadKey(state.tendered, key) });
}

export function openChargeSheet() {
  if (!onlineManager.isOnline()) {
    update({ formError: OFFLINE_SALE_MESSAGE });
    return;
  }
  if (state.draft.lines.length === 0) return;
  update({ chargeOpen: true, cartOpen: false, formError: null });
}

export function dismissChargeSheet(): boolean {
  if (saleAttemptInFlight() || state.submitting) return false;
  update({ chargeOpen: false });
  return true;
}

export function setCartOpen(cartOpen: boolean) {
  if (cartOpen && saleAttemptInFlight()) return;
  update({ cartOpen });
}

export function setCustomOpen(customOpen: boolean) {
  if (customOpen && saleAttemptInFlight()) return;
  update({ customOpen });
}

export function setCustomerOpen(customerOpen: boolean) {
  if (customerOpen && saleAttemptInFlight()) return;
  update({ customerOpen });
}

export function setQuantityKey(quantityKey: string | null) {
  if (quantityKey && saleAttemptInFlight()) return;
  update({ quantityKey });
}

export function dismissSaleSuccess() {
  update({ completed: null });
}

export async function confirmSale(): Promise<void> {
  if (!onlineManager.isOnline()) {
    update({ formError: OFFLINE_SALE_MESSAGE });
    return;
  }
  if (state.draft.lines.length === 0) return;
  const total = cartTotal(state.draft.lines);
  if (state.paymentMethod === 'cash' && cashChange(total, state.tendered) === null) return;
  const body = saleRequestBody(state.draft, {
    paymentMethod: state.paymentMethod,
    referenceNumber: state.referenceNumber,
  });
  const fingerprint = saleFingerprint(body);
  const key = claimSaleAttempt(fingerprint);
  if (!key) {
    update({ formError: SALE_IN_FLIGHT_MESSAGE, chargeOpen: true });
    return;
  }
  update({ submitting: true, formError: null, chargeOpen: true });
  try {
    await saveSaleAttempt({
      fingerprint,
      key,
      paymentMethod: state.paymentMethod,
      referenceNumber: state.referenceNumber,
      tendered: state.tendered,
    });
    const result = await createSale(body, key);
    const completed = saleReceiptHandoff(result);
    finishSaleAttempt();
    await clearSaleAttempt();
    const draft = emptySaleDraft();
    await saveSaleDraft(draft);
    update({
      submitting: false,
      draft,
      completed,
      chargeOpen: false,
      cartOpen: false,
      customOpen: false,
      customerOpen: false,
      quantityKey: null,
      formError: null,
      actionError: null,
      tendered: '',
      referenceNumber: '',
      paymentMethod: 'cash',
    });
  } catch (error) {
    const failure = mapSaleError(error, onlineManager.isOnline());
    if (failure.resetKey) {
      discardSaleAttempt();
      await clearSaleAttempt();
    } else {
      releaseSaleAttempt();
    }
    update({ submitting: false, formError: failure.message, chargeOpen: true });
  }
}
