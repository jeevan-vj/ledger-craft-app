import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/StableAuthContext';
import { useToast } from '@/hooks/use-toast';
import { Mail, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import ModernAuthLayout from '../components/auth/modern/ModernAuthLayout';
import { ModernButton } from '../components/auth/modern/ModernButton';

const EmailConfirmation = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<'loading' | 'error' | 'already_confirmed'>('loading');

  useEffect(() => {
    if (loading) return;

    if (user) {
      setStatus('already_confirmed');
      toast({
        title: 'Already signed in',
        description: 'Redirecting to your dashboard...',
      });
      const timer = window.setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
      return () => window.clearTimeout(timer);
    }

    setStatus('error');
  }, [loading, user, navigate, toast]);

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Checking your session...</h2>
              <p className="text-muted-foreground">Please wait while we verify your account.</p>
            </div>
          </div>
        );

      case 'already_confirmed':
        return (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">You are signed in</h2>
              <p className="text-muted-foreground">
                Email confirmation is not required. Redirecting to your dashboard...
              </p>
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-foreground">Sign in to continue</h2>
                <p className="text-muted-foreground">
                  LedgerCraft uses email and password. No confirmation link is required.
                </p>
              </div>
              <ModernButton onClick={() => navigate('/login')} variant="primary" icon={Mail}>
                Back to Sign In
              </ModernButton>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <ModernAuthLayout
      title="Email Confirmation"
      subtitle="Verifying your account"
      showFeatures={false}
    >
      {renderContent()}
    </ModernAuthLayout>
  );
};

export default EmailConfirmation;
