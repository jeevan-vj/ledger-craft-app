import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  apiErrorTags,
  buildSentryInitOptions,
  formatRelease,
  readSentryDsn,
  selectSentryIntegrations,
  toSentryUser,
  type NamedIntegration,
  type ReleaseIdentity,
} from './sentryOptions';

interface SentryNavigationIntegration {
  registerNavigationContainer: (navigationContainerRef: unknown) => void;
}

interface SentryScope {
  setTag: (key: string, value: string) => void;
  setContext: (key: string, context: Record<string, unknown>) => void;
}

interface SentryModule {
  init: (options: unknown) => void;
  wrap: <T>(component: T) => T;
  setUser: (user: { id: string } | null) => void;
  captureException: (error: unknown) => void;
  withScope: (callback: (scope: SentryScope) => void) => void;
  reactNavigationIntegration: (options?: { enableTimeToInitialDisplay?: boolean }) => SentryNavigationIntegration & NamedIntegration;
  breadcrumbsIntegration: (options?: { console?: boolean }) => NamedIntegration;
}

let navigationIntegration: SentryNavigationIntegration | null = null;

function loadSentry(): SentryModule {
  // Loaded only after a DSN is present, so Jest can import the API client without the native SDK.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@sentry/react-native') as SentryModule;
}

export function readAppReleaseIdentity(): ReleaseIdentity {
  const config = Constants.expoConfig;
  const applicationId = Platform.OS === 'android'
    ? config?.android?.package
    : config?.ios?.bundleIdentifier ?? config?.android?.package;
  const configuredBuild = Platform.OS === 'android'
    ? (config?.android?.versionCode != null ? String(config.android.versionCode) : undefined)
    : config?.ios?.buildNumber;
  return {
    applicationId: applicationId ?? undefined,
    version: Constants.nativeAppVersion || config?.version || undefined,
    build: Constants.nativeBuildVersion || configuredBuild || undefined,
  };
}

export function initSentry(): void {
  const dsn = readSentryDsn();
  if (!dsn) return;
  try {
    const Sentry = loadSentry();
    const navigation = Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: true });
    navigationIntegration = navigation;
    const identity = formatRelease(readAppReleaseIdentity());
    Sentry.init(buildSentryInitOptions({
      dsn,
      release: identity.release,
      dist: identity.dist,
      integrations: (defaults: NamedIntegration[]) => selectSentryIntegrations(defaults, [
        Sentry.breadcrumbsIntegration({ console: false }),
        navigation,
      ]),
    }));
  } catch {
    // A monitoring failure must not stop the app from opening.
  }
}

export function wrapRoot<T>(component: T): T {
  if (!readSentryDsn()) return component;
  return loadSentry().wrap(component);
}

export function registerNavigationContainer(navigationContainerRef: unknown): void {
  if (!readSentryDsn() || !navigationIntegration) return;
  try {
    navigationIntegration.registerNavigationContainer(navigationContainerRef);
  } catch {
    // Navigation context is optional. A failure here must not block the app.
  }
}

export function setSentryUser(userId: string | null | undefined): void {
  if (!readSentryDsn()) return;
  try {
    loadSentry().setUser(toSentryUser(userId));
  } catch {
    // Identity tagging is best-effort.
  }
}

export function captureApiError(error: unknown, status: number, requestId?: string): void {
  if (!readSentryDsn()) return;
  try {
    const Sentry = loadSentry();
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(apiErrorTags(status, requestId))) {
        scope.setTag(key, value);
      }
      Sentry.captureException(error);
    });
  } catch {
    // Reporting must not replace the original API error.
  }
}

export function captureRenderError(error: unknown, componentStack?: string): void {
  if (!readSentryDsn()) return;
  try {
    const Sentry = loadSentry();
    Sentry.withScope((scope) => {
      if (componentStack) scope.setContext('react', { componentStack });
      Sentry.captureException(error);
    });
  } catch {
    // The fallback screen still has to render.
  }
}
