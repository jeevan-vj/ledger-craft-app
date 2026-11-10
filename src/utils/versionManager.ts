/**
 * Version Management and Cache Busting Utilities
 * Ensures users get the latest app version
 */

import { isNewerDeployedBuild } from './appUpdate';

export interface AppVersion {
  version: string;
  buildTime: number;
  hash: string;
}

// Generate version info at build time
export const getCurrentVersion = (): AppVersion => {
  return {
    version: import.meta.env.VITE_APP_VERSION || 'development',
    buildTime: Number(import.meta.env.VITE_BUILD_TIME || 0),
    hash: import.meta.env.VITE_BUILD_HASH || 'development'
  };
};

export async function fetchDeployedVersion(): Promise<AppVersion | null> {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) return null;
    const body = await response.json() as Partial<AppVersion>;
    const buildTime = Number(body.buildTime);
    if (typeof body.hash !== 'string' || !Number.isFinite(buildTime)) return null;
    return {
      version: typeof body.version === 'string' ? body.version : '',
      hash: body.hash,
      buildTime,
    };
  } catch {
    return null;
  }
}

// Compare version.json with the build embedded in this document, including the first read.
export const isVersionOutdated = async (): Promise<boolean> => {
  if (import.meta.env.DEV) return false;
  const server = await fetchDeployedVersion();
  if (!server) return false;
  return isNewerDeployedBuild(getCurrentVersion(), server);
};

function clearRefreshableStorage(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    // A deployment refresh must not erase the identity of a financial request
    // whose response may have been lost after the server committed it.
    if (key && !(key.startsWith('ledgercraft') && key.toLowerCase().includes('pending'))) storage.removeItem(key);
  }
}

// Refresh application caches while retaining unresolved financial operations.
export const forceRefresh = async (): Promise<void> => {
  // Clear all caches
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );
  }
  
  // Clear service worker registration
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(registration => registration.unregister())
    );
  }
  
  clearRefreshableStorage(localStorage);
  clearRefreshableStorage(sessionStorage);
  
  // Force reload with cache bypass
  window.location.reload();
};

// Aggressive cache clearing for critical updates
export const clearAllCaches = async (): Promise<void> => {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => {
        console.log('Clearing cache:', cacheName);
        return caches.delete(cacheName);
      })
    );
  }
};

