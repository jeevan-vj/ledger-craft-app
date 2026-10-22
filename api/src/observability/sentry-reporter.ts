import * as Sentry from '@sentry/cloudflare';
import type { ErrorReport } from './report';

function applyReport(
  scope: Sentry.Scope,
  report: Pick<ErrorReport, 'requestId' | 'route' | 'userId'> & { source?: ErrorReport['source'] },
): void {
  scope.setTag('requestId', report.requestId);
  scope.setTag('route', report.route);
  if (report.source) scope.setTag('source', report.source);
  scope.setTransactionName(report.route);
  if (report.userId) scope.setUser({ id: report.userId });
}

export function tagActiveRequest(report: Pick<ErrorReport, 'requestId' | 'route' | 'userId'>): void {
  if (!Sentry.isEnabled()) return;
  applyReport(Sentry.getCurrentScope(), report);
}

export function createSentryReporter(): (error: unknown, report: ErrorReport) => void {
  return (error, report) => {
    if (!Sentry.isEnabled()) return;
    Sentry.withScope((scope) => {
      applyReport(scope, report);
      Sentry.captureException(error);
    });
  };
}
