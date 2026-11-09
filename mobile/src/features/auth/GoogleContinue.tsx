import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ModernButton } from '@/components/ui/ModernButton';
import { getAuthProviders } from '@/features/auth/api/authApi';
import { space } from '@/theme/tokens';

export function GoogleContinue({ onPress, loading = false }: { onPress: () => void; loading?: boolean }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    getAuthProviders()
      .then((providers) => {
        if (active) setEnabled(providers.google);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!enabled) return null;

  return (
    <View style={styles.wrap}>
      <ModernButton variant="outline" size="lg" fullWidth loading={loading} onPress={onPress}>
        Continue with Google
      </ModernButton>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: space.md,
  },
});
