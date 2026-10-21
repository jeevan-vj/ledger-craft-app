import { scrubText } from './scrub';

export type ErrorSource = 'worker' | 'identity' | 'ledger' | 'better-auth' | 'hono';

export type ErrorReport = {
  source: ErrorSource;
  requestId: string;
  route: string;
  userId?: string;
};

type ErrorReporter = (error: unknown, report: ErrorReport) => void;

let reporter: ErrorReporter = () => {};

export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

export function logUnhandledError(error: unknown, report: ErrorReport): void {
  const errorMessage = scrubText(error instanceof Error ? error.message : String(error));
  const stack = error instanceof Error && error.stack ? scrubText(error.stack) : undefined;
  console.error(
    JSON.stringify({
      msg: 'unhandled_error',
      source: report.source,
      requestId: report.requestId,
      route: report.route,
      name: error instanceof Error ? error.name : 'Error',
      errorMessage,
      ...(stack ? { stack } : {}),
    }),
  );
}

/** Log the scrubbed error, then hand it to the active reporter. Reporting failures stay out of the response. */
export function reportUnhandledError(error: unknown, report: ErrorReport): void {
  logUnhandledError(error, report);
  try {
    reporter(error, report);
  } catch (reportError) {
    console.error(
      JSON.stringify({
        msg: 'error_report_failed',
        requestId: report.requestId,
        name: reportError instanceof Error ? reportError.name : 'Error',
      }),
    );
  }
}
