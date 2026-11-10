interface AppUpdateToastProps {
  open: boolean;
}

export default function AppUpdateToast({ open }: AppUpdateToastProps) {
  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <p
        role="status"
        aria-live="polite"
        className="rounded-2xl bg-card px-4 py-3 text-sm text-card-foreground shadow-surface-lg"
      >
        Updating to the latest version…
      </p>
    </div>
  );
}
