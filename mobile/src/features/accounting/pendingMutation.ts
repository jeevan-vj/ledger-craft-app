import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { randomId } from '@/utils/id';
const envelope = z.object({ key: z.string().min(1), input: z.unknown(), uncertain: z.boolean().default(true) });
export interface PendingMutation<T> { key: string; input: T; uncertain: boolean }
function storageKey(ownerId: string, target: string) {
  if (!ownerId || !target) throw new Error('Wait for the current account before recording this operation.');
  return `ledgercraft.pending.v1.${ownerId}.${target}`.replace(/[^A-Za-z0-9._-]/g, '_');
}
async function read(key: string) { return Platform.OS === 'web' ? globalThis.localStorage.getItem(key) : SecureStore.getItemAsync(key); }
async function write(key: string, value: string) { if (Platform.OS === 'web') globalThis.localStorage.setItem(key, value); else await SecureStore.setItemAsync(key, value); }
export const pendingMutation = {
  async load<T>(ownerId: string, target: string, parse: (input: unknown) => T): Promise<PendingMutation<T> | null> {
    const raw = await read(storageKey(ownerId, target)); if (!raw) return null;
    try { const value = envelope.parse(JSON.parse(raw)); return { ...value, input: parse(value.input) }; }
    catch { throw new Error('Saved operation details are unreadable. Review the source record before trying again.'); }
  },
  async claim<T>(ownerId: string, target: string, input: T, parse: (input: unknown) => T): Promise<PendingMutation<T>> {
    const existing = await this.load(ownerId, target, parse); if (existing) return existing;
    const pending = { key: randomId(), input: parse(input), uncertain: false };
    await write(storageKey(ownerId, target), JSON.stringify(pending)); return pending;
  },
  async fail(ownerId: string, target: string, status: number) {
    const pending = await this.load(ownerId, target, (value) => value); if (!pending || pending.uncertain) return;
    if (status >= 400 && status < 500) { await this.clear(ownerId, target); return; }
    await write(storageKey(ownerId, target), JSON.stringify({ ...pending, uncertain: true }));
  },
  async clear(ownerId: string, target: string) { const key = storageKey(ownerId, target); if (Platform.OS === 'web') globalThis.localStorage.removeItem(key); else await SecureStore.deleteItemAsync(key); },
};
