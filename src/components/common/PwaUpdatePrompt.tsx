import React, { useState } from 'react';
import { RefreshCcw, Settings2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PwaUpdatePromptProps {
  open: boolean;
  onUpdate: () => void;
  onForceUpdate: () => void;
  onClearCaches: () => void;
  onClose: () => void;
}

const PwaUpdatePrompt: React.FC<PwaUpdatePromptProps> = ({
  open,
  onUpdate,
  onForceUpdate,
  onClearCaches,
  onClose,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 transition-[transform,opacity] duration-200 motion-reduce:transition-none ${
        open ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pwa-update-title"
        aria-describedby="pwa-update-description"
        className="pointer-events-auto mb-4 w-full max-w-md rounded-2xl bg-card p-5 text-card-foreground shadow-surface-lg"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <RefreshCcw className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="pwa-update-title" className="text-lg font-semibold">
              Update available
            </h3>
            <p id="pwa-update-description" className="mt-1 text-sm text-muted-foreground">
              Refresh LedgerCraft to use the latest improvements and fixes.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Dismiss update prompt">
            <X aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button onClick={onUpdate} className="flex-1">
            Update now
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAdvanced((value) => !value)}
            aria-label="Toggle update options"
            aria-expanded={showAdvanced}
          >
            <Settings2 aria-hidden="true" />
          </Button>
        </div>

        {showAdvanced && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Troubleshooting</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" onClick={onForceUpdate} className="flex-1">
                <RefreshCcw aria-hidden="true" />
                Force refresh
              </Button>
              <Button variant="outline" onClick={onClearCaches} className="flex-1">
                <Trash2 aria-hidden="true" />
                Clear cache
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PwaUpdatePrompt;
