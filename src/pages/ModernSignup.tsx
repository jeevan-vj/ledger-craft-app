import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from "@/context/StableAuthContext";
import { useToast } from '@/hooks/use-toast';
import { User, Mail, Lock, ArrowRight, Chrome, Shield } from 'lucide-react';
import ModernAuthLayout from '../components/auth/modern/ModernAuthLayout';
import { ModernInput } from '../components/auth/modern/ModernInput';
import { ModernButton } from '../components/auth/modern/ModernButton';
import PasswordStrengthIndicator from '../components/auth/modern/PasswordStrengthIndicator';

const signupSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
  agreeToTerms: z.boolean().refine(val => val === true, 'You must agree to the terms and conditions')
});

type SignupFormValues = z.infer<typeof signupSchema>;

const ModernSignup = () => {
  const { signUp, signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPasswordStrength, setShowPasswordStrength] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid }
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    mode: 'onChange'
  });

  const password = watch('password');
  const agreeToTerms = watch('agreeToTerms');

  const onSubmit = async (values: SignupFormValues) => {
    setIsLoading(true);
    try {
      const { error, needsEmailConfirmation } = await signUp(values.email, values.password, values.fullName);

      if (error) {
        toast({
          title: 'Sign Up Failed',
          description: error.message,
          variant: 'destructive'
        });
      } else if (needsEmailConfirmation) {
        toast({
          title: 'Account Created!',
          description: 'Please check your email to confirm your account, then sign in to continue.'
        });
        // Redirect to login with a message about email confirmation
        navigate('/login', { 
          replace: true,
          state: { 
            message: 'Account created! Please check your email to confirm your account. If you need help with confirmation, visit the confirmation page.',
            email: values.email
          }
        });
      } else {
        toast({
          title: 'Account Created!',
          description: 'Welcome to EasyBizInvoice! Let\'s set up your business profile.'
        });
        // User is immediately authenticated, redirect to onboarding
        navigate('/onboarding', { replace: true });
      }
    } catch (error) {
      toast({
        title: 'Sign Up Failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      
      if (error) {
        toast({
          title: 'Google Sign Up Failed',
          description: error.message,
          variant: 'destructive'
        });
      }
      // If successful, the OAuth flow will redirect to the callback page
      // New users will be redirected to onboarding after successful OAuth
    } catch (error) {
      toast({
        title: 'Google Sign Up Failed', 
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <ModernAuthLayout
      title="Create your account"
      subtitle="Join thousands of professionals using EasyBizInvoice"
      showFeatures={true}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Full Name Field */}
        <ModernInput
          {...register('fullName')}
          label="Full name"
          type="text"
          icon={User}
          placeholder="Enter your full name"
          error={errors.fullName?.message}
          autoComplete="name"
          autoFocus
        />

        {/* Email Field */}
        <ModernInput
          {...register('email')}
          label="Email address"
          type="email"
          icon={Mail}
          placeholder="Enter your email"
          error={errors.email?.message}
          autoComplete="email"
        />

        {/* Password Field */}
        <div className="space-y-3">
          <ModernInput
            {...register('password')}
            label="Password"
            type="password"
            icon={Lock}
            placeholder="Create a password"
            showPasswordToggle
            error={errors.password?.message}
            autoComplete="new-password"
            onFocus={() => setShowPasswordStrength(true)}
          />
          
          {showPasswordStrength && password && (
            <PasswordStrengthIndicator 
              password={password} 
              showCriteria={true}
            />
          )}
        </div>

        {/* Terms and Conditions */}
        <div className="space-y-4">
          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              {...register('agreeToTerms')}
              type="checkbox"
              className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary focus:ring-2 mt-0.5"
            />
            <div className="text-sm text-muted-foreground leading-relaxed">
              I agree to the{' '}
              <Link to="/terms" className="text-primary hover:text-primary/80 transition-colors">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-primary hover:text-primary/80 transition-colors">
                Privacy Policy
              </Link>
            </div>
          </label>
          {errors.agreeToTerms && (
            <p className="text-xs text-destructive">{errors.agreeToTerms.message}</p>
          )}
        </div>

        {/* Security Notice */}
        <div className="bg-muted/50 border border-border/50 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-foreground mb-1">Your data is secure</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We use bank-level encryption to protect your information and never store your password in plain text.
              </p>
            </div>
          </div>
        </div>

        {/* Create Account Button */}
        <ModernButton
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={isLoading}
          disabled={!isValid || !agreeToTerms}
          icon={ArrowRight}
          iconPosition="right"
        >
          {isLoading ? 'Creating account...' : 'Create account'}
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

        {/* Social Signup Buttons */}
        <div className="grid gap-3">
          <ModernButton
            type="button"
            variant="outline"
            fullWidth
            icon={Chrome}
            disabled={isLoading || isGoogleLoading}
            loading={isGoogleLoading}
            onClick={handleGoogleSignUp}
          >
            {isGoogleLoading ? 'Signing up...' : 'Google'}
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
                description: 'GitHub signup will be available soon!',
              });
            }}
          >
            GitHub
          </ModernButton> */}
        </div>

        {/* Sign In Link */}
        <div className="text-center">
          <span className="text-muted-foreground">Already have an account? </span>
          <Link
            to="/login"
            className="text-primary hover:text-primary/80 font-medium transition-colors"
          >
            Sign in instead
          </Link>
        </div>
      </form>
    </ModernAuthLayout>
  );
};

export default ModernSignup;