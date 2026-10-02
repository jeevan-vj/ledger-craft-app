import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from "@/context/StableAuthContext";
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, ArrowRight, Github, Chrome } from 'lucide-react';
import ModernAuthLayout from '../components/auth/modern/ModernAuthLayout';
import { ModernInput } from '../components/auth/modern/ModernInput';
import { ModernButton } from '../components/auth/modern/ModernButton';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

type LoginFormValues = z.infer<typeof loginSchema>;

const ModernLogin = () => {
  const { signIn, signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isValid }
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange'
  });

  // Handle signup confirmation message
  useEffect(() => {
    const state = location.state as { message?: string; email?: string };
    if (state?.message) {
      toast({
        title: 'Account Created',
        description: state.message,
      });
      
      // Pre-fill email if provided
      if (state.email) {
        setValue('email', state.email);
      }
      
      // Clear the state to prevent showing the message again
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, toast, navigate, setValue]);

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    try {
      const { error } = await signIn(values.email, values.password);

      if (error) {
        toast({
          title: 'Login Failed',
          description: error.message,
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Welcome back!',
          description: 'You have been successfully logged in.'
        });
        
        // Navigate to the intended destination or dashboard
        const from = location.state?.from?.pathname || '/';
        navigate(from, { replace: true });
      }
    } catch (error) {
      toast({
        title: 'Login Failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      
      if (error) {
        toast({
          title: 'Google Sign In Failed',
          description: error.message,
          variant: 'destructive'
        });
      }
      // If successful, the OAuth flow will redirect to the callback page
    } catch (error) {
      toast({
        title: 'Google Sign In Failed', 
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <ModernAuthLayout
      title="Welcome back"
      subtitle="Sign in to your account to continue"
      showFeatures={true}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Email Field */}
        <ModernInput
          {...register('email')}
          label="Email address"
          type="email"
          icon={Mail}
          placeholder="Enter your email"
          error={errors.email?.message}
          autoComplete="email"
          autoFocus
        />

        {/* Password Field */}
        <ModernInput
          {...register('password')}
          label="Password"
          type="password"
          icon={Lock}
          placeholder="Enter your password"
          showPasswordToggle
          error={errors.password?.message}
          autoComplete="current-password"
        />

        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary focus:ring-2"
            />
            <span className="text-muted-foreground">Remember me</span>
          </label>
          
          <Link
            to="/forgot-password"
            className="text-primary hover:text-primary/80 transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        {/* Sign In Button */}
        <ModernButton
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={isLoading}
          disabled={!isValid}
          icon={ArrowRight}
          iconPosition="right"
        >
          {isLoading ? 'Signing in...' : 'Sign in'}
        </ModernButton>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        {/* Social Login Buttons */}
        <div className="grid gap-3">
          <ModernButton
            type="button"
            variant="outline"
            fullWidth
            icon={Chrome}
            disabled={isLoading || isGoogleLoading}
            loading={isGoogleLoading}
            onClick={handleGoogleSignIn}
          >
            {isGoogleLoading ? 'Signing in...' : 'Google'}
          </ModernButton>
          
          {/* <ModernButton
            type="button"
            variant="outline"
            size="md"
            icon={Github}
            disabled={isLoading || isGoogleLoading}
            onClick={() => {
              toast({
                title: 'Coming Soon',
                description: 'GitHub login will be available soon!',
              });
            }}
          >
            GitHub
          </ModernButton> */}
        </div>

        {/* Sign Up Link */}
        <div className="text-center">
          <span className="text-muted-foreground">Don't have an account? </span>
          <Link
            to="/signup"
            className="text-primary hover:text-primary/80 font-medium transition-colors"
          >
            Sign up for free
          </Link>
        </div>
      </form>
    </ModernAuthLayout>
  );
};

export default ModernLogin;
