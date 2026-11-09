import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from "@/context/StableAuthContext";
import { useToast } from '@/hooks/use-toast';
import { User, Mail, Lock, ArrowRight } from 'lucide-react';
import { GoogleSignInSection } from '@/features/auth/GoogleSignInSection';
import ModernAuthLayout from '../components/auth/modern/ModernAuthLayout';
import { ModernInput } from '../components/auth/modern/ModernInput';
import { ModernButton } from '../components/auth/modern/ModernButton';

const signupSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Use at least 8 characters.'),
  agreeToTerms: z.boolean().refine(val => val === true, 'You must agree to the terms and conditions')
});

type SignupFormValues = z.infer<typeof signupSchema>;

const ModernSignup = () => {
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid }
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    mode: 'onChange'
  });

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

  return (
    <ModernAuthLayout
      title="Create your account"
      subtitle="Join thousands of professionals using EasyBizInvoice"
      showFeatures={true}
    >
      <GoogleSignInSection errorPath="/signup" />
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
            placeholder="At least 8 characters"
            showPasswordToggle
            error={errors.password?.message}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">Same rule as the mobile app: 8 or more characters.</p>
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
            <p className="text-xs text-destructive" role="alert">{errors.agreeToTerms.message}</p>
          )}
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