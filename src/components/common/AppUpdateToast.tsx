import { Button } from '@/components/ui/button';

interface AppUpdateToastProps {
  open: boolean;
  onReload: () => void;
  onDismiss: () => void;
}

export default function AppUpdateToast({ open, onReload, onDismiss }: AppUpdateToastProps) {
  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-sm text-card-foreground shadow-surface-lg"
      >
        <p>Update available</p>
        <Button type="button" onClick={onReload}>Reload</Button>
        <Button type="button" variant="ghost" onClick={onDismiss} aria-label="Dismiss update prompt">
          Dismiss
        </Button>
      </div>
    </div>
  );
}
