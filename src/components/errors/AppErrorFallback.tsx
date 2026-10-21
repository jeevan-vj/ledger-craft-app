import { useEffect, useState } from 'react';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { useRouteError } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { captureAppError } from '@/lib/sentry/init';

type AppErrorFallbackProps = {
  eventId?: string;
  onReload?: () => void;
};

function reloadPage(): void {
  window.location.reload();
}

export function AppErrorFallback({ eventId, onReload = reloadPage }: AppErrorFallbackProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-border bg-card px-8 py-10 text-center"
      >
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <TriangleAlert className="h-6 w-6 text-foreground" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance">Something went wrong</h1>
        <p className="mx-auto mt-3 max-w-sm text-base text-muted-foreground">
          EasyBizInvoice hit an unexpected error. Reload the page to continue.
        </p>
        {eventId ? (
          <p className="mt-4 text-xs text-muted-foreground">Reference {eventId}</p>
        ) : null}
        <Button type="button" size="lg" className="mt-8" onClick={onReload}>
          <RotateCw aria-hidden="true" />
          Reload
        </Button>
      </div>
    </main>
  );
}

export function RouteErrorFallback({ onReload }: { onReload?: () => void }) {
  const error = useRouteError();
  const [eventId, setEventId] = useState<string | undefined>();

  useEffect(() => {
    setEventId(captureAppError(error));
  }, [error]);

  return <AppErrorFallback eventId={eventId} onReload={onReload} />;
}
