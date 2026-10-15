import React, { useState, useEffect } from 'react';
import { TaxConfigurationPanel } from '@/components/tax/TaxConfigurationPanel';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaxConfiguration } from '@/types/payment';
import { PageHeader } from '@/components/layout/PageHeader';

export default function TaxConfigurationPage() {
  const [configurations, setConfigurations] = useState<TaxConfiguration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const { toast } = useToast();

  const fetchTaxConfigurations = async () => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock tax configurations
      const mockConfigurations: TaxConfiguration[] = [
        {
          id: 'tax-1',
          userId: 'user-1',
          countryCode: 'NZ',
          taxType: 'GST',
          taxRate: 0.15,
          taxName: 'GST',
          appliesToServices: true,
          appliesToGoods: true,
          effectiveFrom: '2023-01-01',
          isActive: true,
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z'
        },
        {
          id: 'tax-2',
          userId: 'user-1',
          countryCode: 'NZ',
          taxType: 'GST',
          taxRate: 0.125,
          taxName: 'GST',
          appliesToServices: true,
          appliesToGoods: true,
          effectiveFrom: '2022-01-01',
          effectiveTo: '2022-12-31',
          isActive: false,
          createdAt: '2022-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z'
        }
      ];

      setConfigurations(mockConfigurations);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load tax configurations",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxConfigurations();
  }, []);

  const handleSaveConfiguration = async (
    config: Omit<TaxConfiguration, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newConfig: TaxConfiguration = {
        id: `tax-${Date.now()}`,
        userId: 'user-1',
        ...config,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Deactivate existing active configurations if this one is active
      if (newConfig.isActive) {
        setConfigurations(prev => 
          prev.map(cfg => ({ ...cfg, isActive: false }))
        );
      }

      setConfigurations(prev => [newConfig, ...prev]);
      
      toast({
        title: "Success",
        description: "Tax configuration saved successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save tax configuration",
        variant: "destructive"
      });
      throw error;
    }
  };

  const handleUpdateConfiguration = async (
    id: string,
    updates: Partial<TaxConfiguration>
  ) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // If activating this config, deactivate others
      if (updates.isActive) {
        setConfigurations(prev => 
          prev.map(cfg => cfg.id === id 
            ? { ...cfg, ...updates, updatedAt: new Date().toISOString() }
            : { ...cfg, isActive: false }
          )
        );
      } else {
        setConfigurations(prev => 
          prev.map(cfg => cfg.id === id 
            ? { ...cfg, ...updates, updatedAt: new Date().toISOString() }
            : cfg
          )
        );
      }
      
      toast({
        title: "Success",
        description: "Tax configuration updated successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update tax configuration",
        variant: "destructive"
      });
      throw error;
    }
  };

  const handleDeleteConfiguration = async (id: string) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setConfigurations(prev => prev.filter(cfg => cfg.id !== id));
      
      toast({
        title: "Success",
        description: "Tax configuration deleted successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete tax configuration",
        variant: "destructive"
      });
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>

        {/* Current Configuration Skeleton */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-10 w-32" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-32" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-8 w-20" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
              
              <div className="border-t pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview Card Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-32" />
                </div>
              </div>
              
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax Configuration"
        description="Configure tax rates and settings for accurate tax calculations"
      />

      {/* Tax Configuration Panel */}
      <TaxConfigurationPanel
        configurations={configurations}
        onSave={handleSaveConfiguration}
        onUpdate={handleUpdateConfiguration}
        onDelete={handleDeleteConfiguration}
        isLoading={isLoading}
      />
    </div>
  );
}