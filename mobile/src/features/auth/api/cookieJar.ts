import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const COOKIE_KEY = 'ledgercraft.auth.cookie';

let memoryCookies: string | null = null;
let loaded = false;
let secureStoreAvailable: boolean | null = null;

async function canUseSecureStore(): Promise<boolean> {
  // Native keeps the original SecureStore behaviour; only Expo web probes availability.
  if (Platform.OS !== 'web') return true;
  return typeof SecureStore.isAvailableAsync === 'function' ? SecureStore.isAvailableAsync() : true;
}

type HeaderBag = {
  get?: (name: string) => string | null;
  getSetCookie?: () => string[];
};

function parseSetCookie(header: string): { name: string; value: string } | null {
  const pair = header.split(';')[0]?.trim();
  if (!pair || !pair.includes('=')) {
    return null;
  }
  const eq = pair.indexOf('=');
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1) };
}

function cookieMapFromHeader(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) {
    return map;
  }
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
  }
  return map;
}

async function load(): Promise<void> {
  if (loaded) {
    return;
  }
  loaded = true;
  secureStoreAvailable = await canUseSecureStore();
  memoryCookies = secureStoreAvailable ? (await SecureStore.getItemAsync(COOKIE_KEY)) ?? null : null;
}

export async function getCookieHeader(): Promise<string | null> {
  await load();
  return memoryCookies;
}

export async function rememberSetCookie(headers?: HeaderBag | null): Promise<void> {
  if (!headers) {
    return;
  }

  const list: string[] = [];
  if (typeof headers.getSetCookie === 'function') {
    list.push(...headers.getSetCookie());
  }
  const raw = headers.get?.('set-cookie');
  if (raw && list.length === 0) {
    list.push(raw);
  }
  if (list.length === 0) {
    return;
  }

  await load();
  const map = cookieMapFromHeader(memoryCookies);
  for (const header of list) {
    const parsed = parseSetCookie(header);
    if (parsed) {
      map.set(parsed.name, parsed.value);
    }
  }

  memoryCookies = [...map.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  if (secureStoreAvailable) await SecureStore.setItemAsync(COOKIE_KEY, memoryCookies);
}

export async function rememberSessionToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    return;
  }
  await load();
  const map = cookieMapFromHeader(memoryCookies);
  map.set('better-auth.session_token', trimmed);
  memoryCookies = [...map.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  if (secureStoreAvailable) await SecureStore.setItemAsync(COOKIE_KEY, memoryCookies);
}

export async function clearCookies(): Promise<void> {
  memoryCookies = null;
  loaded = true;
  secureStoreAvailable ??= await canUseSecureStore();
  if (secureStoreAvailable) await SecureStore.deleteItemAsync(COOKIE_KEY);
}
