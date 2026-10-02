import React from 'react';
import { ThemeToggle } from '../../ui/theme-toggle';
import { CheckCircle, TrendingUp, Users, Shield, Zap } from 'lucide-react';

interface ModernAuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  showFeatures?: boolean;
}

const features = [
  {
    icon: TrendingUp,
    title: "Professional Invoicing",
    description: "Create stunning invoices in minutes"
  },
  {
    icon: Users,
    title: "Client Management", 
    description: "Keep track of all your customers"
  },
  {
    icon: Shield,
    title: "Secure & Reliable",
    description: "Bank-level security for your data"
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Optimized for speed and performance"
  }
];

const testimonials = [
  {
    text: "EasyBizInvoice transformed how we handle invoicing. It's simply amazing!",
    author: "Sarah Chen",
    role: "Freelance Designer"
  },
  {
    text: "The most intuitive invoicing app I've ever used. Highly recommended!",
    author: "Michael Rodriguez", 
    role: "Small Business Owner"
  }
];

export default function ModernAuthLayout({ children, title, subtitle, showFeatures = true }: ModernAuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      
      <div className="flex min-h-screen">
        {/* Left Panel - Brand & Features */}
        <div className="hidden lg:flex lg:flex-1 relative overflow-hidden bg-accent/[0.45]">
            
            <div className="relative flex flex-col justify-center px-12 py-16">
            {/* Logo & Brand */}
            <div className="mb-12">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mr-4 shadow-lg">
                  <img src="/logo.png" alt="EasyBizInvoice" className="w-10 h-10" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    EasyBizInvoice
                  </h1>
                  <p className="text-muted-foreground text-sm">Professional Business Solutions</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <h2 className="text-4xl font-bold text-foreground leading-tight">
                  Streamline Your
                  <span className="block text-primary">
                    Business Operations
                  </span>
                </h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Create professional invoices, manage customers, and track expenses with our modern, intuitive platform.
                </p>
              </div>
            </div>

            {/* Features */}
            {showFeatures && (
              <div className="mb-12 space-y-6">
                  <h3 className="text-xl font-semibold text-foreground mb-4">Why choose EasyBizInvoice?</h3>
                <div className="grid grid-cols-1 gap-4">
                  {features.map((feature, index) => (
                      <div key={index} className="flex items-start space-x-3 group">
                        <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center transition-colors duration-200 group-hover:bg-primary/20">
                          <feature.icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground">{feature.title}</h4>
                          <p className="text-sm text-muted-foreground">{feature.description}</p>
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            )}

            {/* Testimonials */}
            <div className="space-y-6">
              {testimonials.map((testimonial, index) => (
                  <div key={index} className="rounded-2xl bg-card p-6 shadow-surface">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-success/[0.10] rounded-full flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-success" />
                      </div>
                      <div>
                        <p className="text-foreground italic mb-2">"{testimonial.text}"</p>
                        <div className="text-sm">
                          <div className="font-medium text-foreground">{testimonial.author}</div>
                          <div className="text-muted-foreground">{testimonial.role}</div>
                        </div>
                      </div>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel - Auth Form */}
          <div className="flex-1 lg:flex-none lg:w-96 xl:w-[480px] flex items-center justify-center p-6 lg:p-12">
            <div className="w-full max-w-sm">
              {/* Mobile Logo */}
                <div className="lg:hidden text-center mb-8">
                  <div className="inline-flex items-center mb-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center mr-3 shadow-lg">
                      <img src="/logo.png" alt="EasyBizInvoice" className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                      EasyBizInvoice
                    </h1>
                  </div>
                </div>

              {/* Form Card */}
                <div className="rounded-2xl bg-card p-8 shadow-surface-lg space-y-6">
                    <div className="text-center space-y-2">
                      <h2 className="text-2xl font-bold text-card-foreground">{title}</h2>
                      <p className="text-muted-foreground">{subtitle}</p>
                    </div>
                  
                    {children}
                </div>

              {/* Mobile Features */}
                <div className="lg:hidden mt-8 text-center">
                  <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center justify-center space-x-2 hover:text-foreground transition-colors duration-300">
                      <Shield className="h-4 w-4" />
                      <span>Secure</span>
                    </div>
                    <div className="flex items-center justify-center space-x-2 hover:text-foreground transition-colors duration-300">
                      <Zap className="h-4 w-4" />
                      <span>Fast</span>
                    </div>
                  </div>
                </div>
            </div>
          </div>
      </div>
    </div>
  );
}
