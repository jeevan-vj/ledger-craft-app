/**
 * Consolidated Provider Component
 * Combines all providers in the correct order
 */

import React, { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';

import { AuthProvider } from './AuthProvider';
import { AppDataProvider } from './AppDataProvider';
import { UIProvider } from './UIProvider';

// Create query client outside component to avoid recreation
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Main application providers wrapper
 * Order matters: Auth → UI → Data → React Query → UI Components
 */
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <AuthProvider>
            <UIProvider>
              <AppDataProvider>
                {children}
                <Toaster />
                <Sonner />
              </AppDataProvider>
            </UIProvider>
          </AuthProvider>
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default AppProviders;

// Re-export individual providers for testing
export { AuthProvider, AppDataProvider, UIProvider };
