import { useCallback, useEffect, useState } from 'react';
import { loadQuickSaleEnabled, saveQuickSaleEnabled } from './saleStorage';

let enabled = false;
let ready = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function resetQuickSalePreferenceForTests() {
  enabled = false;
  ready = false;
  loading = null;
  listeners.clear();
}

async function ensureLoaded() {
  if (ready) return;
  if (!loading) {
    loading = loadQuickSaleEnabled()
      .then((value) => {
        enabled = value;
        ready = true;
        emit();
      })
      .catch(() => {
        enabled = false;
        ready = true;
        emit();
      });
  }
  await loading;
}

export function useQuickSaleEnabled() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((version) => version + 1);
    listeners.add(listener);
    void ensureLoaded();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    enabled = value;
    ready = true;
    emit();
    void saveQuickSaleEnabled(value);
  }, []);

  return { enabled, ready, setEnabled };
}
