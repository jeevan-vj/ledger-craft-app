import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/context/StableAuthContext';
import { useToast } from '@/hooks/use-toast';
import { User, Mail, Lock } from 'lucide-react';

const signupSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const Signup = () => {
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: ''
    }
  });

  const onSubmit = async (values: z.infer<typeof signupSchema>) => {
    const { error } = await signUp(values.email, values.password, values.fullName);

    if (error) {
      toast({
        title: 'Sign Up Failed',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Sign Up Successful',
        description: 'Your account is ready. You can start using LedgerCraft.',
      });
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/20">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary mb-2">EasyBizInvoice</h1>
          <p className="text-muted-foreground">Create your account</p>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                      <Input 
                        placeholder="Your full name" 
                        {...field} 
                        className="pl-10"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                      <Input 
                        placeholder="you@example.com" 
                        {...field} 
                        className="pl-10"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
                      <Input 
                        type="password" 
                        placeholder="Create a password" 
                        {...field} 
                        className="pl-10"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Signing Up...' : 'Create Account'}
            </Button>
          </form>
        </Form>
        
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Already have an account? {' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
