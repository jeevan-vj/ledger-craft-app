import { useRef } from 'react';
import type { CreateTaxReturnRequest } from '@ledgercraft/contracts';
import { accountingCompletionApi } from './api';

/** Keep the original body/key after an uncertain network response. The server
 * replays that draft, rather than creating a second record with a new timestamp. */
export function usePreparedDraft() {
  const pending = useRef<{ signature: string; input: CreateTaxReturnRequest; key: string }>();
  return {
    clear: () => { pending.current = undefined; },
    async save(input: CreateTaxReturnRequest, signature: string) {
      if (pending.current?.signature !== signature) pending.current = { input, signature, key: crypto.randomUUID() };
      const draft = await accountingCompletionApi.saveTaxDraft(pending.current.input, pending.current.key);
      pending.current = undefined;
      return draft;
    },
  };
}
