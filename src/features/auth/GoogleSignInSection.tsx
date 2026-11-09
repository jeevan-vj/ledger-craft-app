import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ModernButton } from '@/components/auth/modern/ModernButton';
import { useToast } from '@/hooks/use-toast';
import { getAuthProviders, startGoogleSignIn } from '@/features/auth/api/authApi';
import { googleSignInErrorMessage } from '@/features/auth/googleSignIn';

export function GoogleSignInSection({ errorPath }: { errorPath: '/login' | '/signup' }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getAuthProviders()
      .then((providers) => {
        if (active) setEnabled(providers.google);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const message = googleSignInErrorMessage(params.get('error'), params.get('error_description'));
    if (!message) return;
    toast({ title: 'Google sign-in', description: message, variant: 'destructive' });
    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate, toast]);

  if (!enabled) return null;

  const start = async () => {
    setLoading(true);
    try {
      const callbackURL = `${window.location.origin}/auth/callback`;
      await startGoogleSignIn({
        callbackURL,
        newUserCallbackURL: `${callbackURL}?next=/onboarding`,
        errorCallbackURL: `${window.location.origin}${errorPath}`,
      });
    } catch (error) {
      toast({
        title: 'Google sign-in',
        description: error instanceof Error ? error.message : 'Google sign-in did not finish. Try again.',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <ModernButton type="button" variant="outline" size="lg" fullWidth loading={loading} onClick={() => void start()}>
        Continue with Google
      </ModernButton>
      <p className="text-center text-sm text-muted-foreground">or</p>
    </div>
  );
}
