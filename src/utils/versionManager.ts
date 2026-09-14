/**
 * Version Management and Cache Busting Utilities
 * Ensures users get the latest app version
 */

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

// Store the initial version to prevent false positives
let initialServerVersion: AppVersion | null = null;

// Check if app version has changed
export const isVersionOutdated = async (): Promise<boolean> => {
  try {
    // Skip version check in development
    if (import.meta.env.DEV) {
      return false;
    }
    
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      console.log('📡 Version endpoint not available - skipping check');
      return false;
    }
    
    const serverVersion: AppVersion = await response.json();
    
    // Skip if server version is placeholder/initial values
    if (serverVersion.hash === 'initial' || serverVersion.buildTime === 0) {
      console.log('📡 Server version is placeholder - skipping check');
      return false;
    }
    
    // Store initial server version on first check
    if (!initialServerVersion) {
      initialServerVersion = { ...serverVersion };
      console.log('📡 Initial server version recorded:', serverVersion.hash);
      return false; // Never trigger update on first check
    }
    
    const currentVersion = getCurrentVersion();
    
    // Only consider it outdated if server version is newer than our initial version
    const isOutdated = serverVersion.hash !== initialServerVersion.hash && 
                       serverVersion.buildTime > initialServerVersion.buildTime;
    
    if (isOutdated) {
      console.log('📡 New version detected:', {
        current: initialServerVersion.hash,
        new: serverVersion.hash
      });
    }
    
    return isOutdated;
  } catch (error) {
    console.log('📡 Version check failed (normal during development):', error.message);
    return false;
  }
};

// Force complete cache clear and reload
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
  
  // Clear storage
  localStorage.clear();
  sessionStorage.clear();
  
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

// Check for updates periodically
export const startVersionPolling = (interval: number = 10 * 60 * 1000): (() => void) => {
  // Skip polling in development
  if (import.meta.env.DEV) {
    console.log('📡 Version polling disabled in development');
    return () => {}; // Return empty cleanup function
  }

  const checkForUpdates = async () => {
    const isOutdated = await isVersionOutdated();
    if (isOutdated) {
      console.log('🚀 New version detected, prompting update...');
      
      // Dispatch custom event for update detection
      window.dispatchEvent(new CustomEvent('app-version-outdated', {
        detail: { needsUpdate: true }
      }));
    }
  };

  // Delay initial check to avoid blocking app startup
  const initialCheckTimer = setTimeout(checkForUpdates, 30000); // Wait 30 seconds
  
  // Then poll periodically
  const intervalId = setInterval(checkForUpdates, interval);
  
  // Return cleanup function
  return () => {
    clearTimeout(initialCheckTimer);
    clearInterval(intervalId);
  };
};

// Check for updates when app gains focus
export const enableFocusUpdateCheck = (): (() => void) => {
  // Skip focus checks in development
  if (import.meta.env.DEV) {
    return () => {}; // Return empty cleanup function
  }

  // Throttle focus checks to prevent spam
  let lastFocusCheck = 0;
  const FOCUS_CHECK_THROTTLE = 2 * 60 * 1000; // 2 minutes

  const handleFocus = async () => {
    const now = Date.now();
    if (now - lastFocusCheck < FOCUS_CHECK_THROTTLE) {
      return; // Skip if checked recently
    }
    
    lastFocusCheck = now;
    console.log('🔍 App focused, checking for updates...');
    
    const isOutdated = await isVersionOutdated();
    if (isOutdated) {
      window.dispatchEvent(new CustomEvent('app-version-outdated', {
        detail: { needsUpdate: true }
      }));
    }
  };

  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      handleFocus();
    }
  });
  
  return () => {
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleFocus);
  };
};
