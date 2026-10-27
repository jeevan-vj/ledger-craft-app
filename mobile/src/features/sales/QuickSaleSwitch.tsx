import React from 'react';
import { FormSwitch } from '@/components/ui/FormSwitch';
import { useQuickSaleEnabled } from './quickSalePreference';

export function QuickSaleSwitch() {
  const { enabled, setEnabled } = useQuickSaleEnabled();
  return (
    <FormSwitch
      label="Quick sale"
      description="Show the Sell tab for market sales. It stays off until you turn it on."
      value={enabled}
      onValueChange={setEnabled}
    />
  );
}
