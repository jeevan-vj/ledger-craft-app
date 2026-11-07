import React, { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { StripePaymentLink } from '@ledgercraft/contracts';
import { GroupedSection, ModernButton } from '@/components/ui';
import { stripeApi } from '@/features/stripe/api/stripeApi';
import { getServerCapabilities } from '@/services/capabilitiesService';
import { useTheme } from '@/theme';
import { space } from '@/theme/tokens';

type Props = { invoiceId: string; currency: string; status: string; balanceDue: string; canCreate?: boolean };

export function StripePaymentLinkSection({ invoiceId, currency, status, balanceDue, canCreate = true }: Props) {
  const theme = useTheme();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<StripePaymentLink>();
  const eligible = canCreate && currency.toUpperCase() === 'NZD' && status !== 'cancelled' && Number(balanceDue) > 0;

  useEffect(() => {
    if (!eligible) return;
    void getServerCapabilities().then(async capabilities => { if (capabilities.stripe !== 'available') { setAvailable(false); return; } const account = await stripeApi.account(); setAvailable(account.paymentsApproved !== false); }).catch(()=>setAvailable(false));
  }, [eligible]);

  const createLink = async () => {
    if (busy) return;
    setBusy(true);
    try { setLink(await stripeApi.createPaymentLink(invoiceId)); }
    catch { Alert.alert('Could not create payment link', 'Check Stripe setup and your connection, then try again.'); }
    finally { setBusy(false); }
  };

  if (!eligible || !available) return null;
  return (
    <GroupedSection title="Card payment" footer="The hosted page securely collects the customer’s card details.">
      <View style={styles.content}>
        {link ? <>
          <Text selectable style={[theme.type.footnote, { color: theme.colors.textSecondary }]} numberOfLines={2}>{link.payUrl}</Text>
          <ModernButton variant="secondary" fullWidth onPress={() => void Clipboard.setStringAsync(link.payUrl)}>Copy payment link</ModernButton>
          <ModernButton variant="outline" fullWidth onPress={() => void Share.share({ message: `Pay this invoice securely: ${link.payUrl}` })}>Share payment link</ModernButton>
        </> : <ModernButton fullWidth loading={busy} onPress={() => void createLink()}>Get paid by card</ModernButton>}
      </View>
    </GroupedSection>
  );
}

const styles = StyleSheet.create({ content: { padding: space.lg, gap: space.md } });
