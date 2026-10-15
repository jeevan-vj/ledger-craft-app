import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/StableAuthContext';
import { getMe } from '@/features/auth/api/authApi';
import { Loader2 } from 'lucide-react';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        await refreshUser();
        const me = await getMe();

        if (!me) {
          navigate('/login', { replace: true });
          return;
        }

        toast({
          title: 'Welcome back!',
          description: 'You have been signed in.',
        });

        const next = new URLSearchParams(window.location.search).get('next') || '/';
        navigate(next, { replace: true });
      } catch (error) {
        console.error('Unexpected error during auth callback:', error);
        toast({
          title: 'Authentication Error',
          description: 'An unexpected error occurred. Please try again.',
          variant: 'destructive',
        });
        navigate('/login', { replace: true });
      }
    };

    void handleAuthCallback();
  }, [navigate, toast, refreshUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <h2 className="text-xl font-semibold text-foreground">
          Completing your sign in...
        </h2>
        <p className="text-muted-foreground">
          Please wait while we redirect you.
        </p>
      </div>
    </div>
  );
};

export default AuthCallback;
