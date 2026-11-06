import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import type { StripeAccountStatus } from '@ledgercraft/contracts';
import { GroupedSection, ModernButton } from '@/components/ui';
import { stripeApi } from '@/features/stripe/api/stripeApi';
import { getServerCapabilities } from '@/services/capabilitiesService';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';

export function StripeSettingsSection({ canManage }: { canManage: boolean }) {
  const theme = useTheme();
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<StripeAccountStatus>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const capabilities = await getServerCapabilities();
    if (capabilities.stripe !== 'available' || !canManage) return;
    setAvailable(true);
    try {
      setStatus(await stripeApi.account());
    } catch {
      Alert.alert('Could not load card payments', 'Check your connection and try again.');
    }
  }, [canManage]);

  useEffect(() => { void load(); }, [load]);

  const startOnboarding = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!status || status.status === 'not_connected') await stripeApi.createAccount();
      const link = await stripeApi.onboardingLink();
      await Linking.openURL(link.url);
    } catch {
      Alert.alert('Could not open Stripe setup', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    try { setStatus(await stripeApi.refreshAccount()); }
    catch { Alert.alert('Could not refresh Stripe status', 'Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  if (!available) return null;
  const ready = status?.chargesEnabled && status.payoutsEnabled;
  return (
    <GroupedSection title="Card payments" footer="Stripe handles identity checks, card details, and payouts. LedgerCraft never stores card numbers.">
      <View style={styles.content}>
        <Text style={[theme.type.body, { color: theme.colors.text }]}>{ready ? 'Ready to accept card payments' : status?.status === 'not_connected' ? 'Connect Stripe to accept invoice card payments.' : 'Finish Stripe setup to accept card payments.'}</Text>
        <ModernButton onPress={() => void startOnboarding()} loading={busy} fullWidth>{status?.status === 'not_connected' ? 'Set up card payments' : 'Continue Stripe setup'}</ModernButton>
        {status?.status !== 'not_connected' ? <ModernButton onPress={() => void refresh()} disabled={busy} variant="outline" fullWidth>Refresh status</ModernButton> : null}
      </View>
    </GroupedSection>
  );
}

const styles = StyleSheet.create({ content: { padding: space.lg, gap: space.md } });
