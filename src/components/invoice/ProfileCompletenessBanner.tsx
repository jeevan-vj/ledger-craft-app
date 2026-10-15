import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import {
  describeMissingFields,
  getMissingProfileFields,
  type ProfileCompletenessInput,
} from '@/utils/profileCompleteness';

const DISMISS_KEY = 'profile-completeness-dismissed';

interface ProfileCompletenessBannerProps {
  profile: ProfileCompletenessInput | null | undefined;
  settingsHref?: string;
}

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function ProfileCompletenessBanner({
  profile,
  settingsHref = '/settings',
}: ProfileCompletenessBannerProps) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const missing = getMissingProfileFields(profile);

  if (dismissed || missing.length === 0) {
    return null;
  }

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // sessionStorage can be unavailable in private mode or tests
    }
    setDismissed(true);
  };

  return (
    <div
      data-testid="profile-completeness-banner"
      className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Add {describeMissingFields(missing)} before you send
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional, but it makes invoices look complete.{' '}
          <Link to={settingsHref} className="font-medium text-primary underline underline-offset-4">
            Update in settings
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        data-testid="profile-completeness-dismiss"
        className="rounded-md p-1 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss profile reminder"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
