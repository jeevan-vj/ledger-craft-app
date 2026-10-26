import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppPressable } from '@/components/ui/AppPressable';
import { AuthApiError, OFFLINE_MESSAGE } from '@/features/auth/api/http';
import { invoiceReminderRequest } from '@/features/invoices/invoiceSharing';
import { invoiceService } from '@/services/invoiceService';
import type { Invoice } from '@/types/invoice';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';
import { getServerCapabilities } from '@/services/capabilitiesService';

interface InvoiceDeliverySectionProps {
  readonly invoice: Invoice;
  readonly canSend: boolean;
  readonly onShareInstead: () => void;
  readonly onSent: () => void;
  readonly emailAvailable?: boolean;
}

function safeDeliveryMessage(error: unknown): string {
  if (error instanceof AuthApiError && error.status === 0) {
    return OFFLINE_MESSAGE;
  }
  if (
    error instanceof AuthApiError
    && error.message.trim()
    && !/https?:|shared\/(?:invoice|quote)|api\/public|pnpm dev:api|port 3001/i.test(error.message)
  ) {
    return error.message;
  }
  return 'The request did not finish. Nothing was sent.';
}

export function InvoiceDeliverySection({
  invoice,
  canSend,
  onShareInstead,
  onSent,
  emailAvailable: emailAvailableOverride,
}: InvoiceDeliverySectionProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const palette = theme.colors;
  const [busy, setBusy] = useState<'send' | 'remind' | null>(null);
  const [emailAvailable, setEmailAvailable] = useState(emailAvailableOverride ?? false);
  useEffect(() => {
    if (emailAvailableOverride !== undefined) return;
    void getServerCapabilities().then((value) => setEmailAvailable(value.email === 'available'));
  }, [emailAvailableOverride]);

  if (!canSend) return null;

  if (!emailAvailable) return (
    <View style={styles.card}>
      <Text style={styles.title}>Delivery</Text>
      <Text style={styles.meta}>Email isn’t set up on this server yet. Share a secure invoice link instead.</Text>
      <AppPressable accessibilityRole="button" accessibilityLabel="Share invoice link" onPress={onShareInstead} style={styles.action}>
        <Feather name="link" size={18} color={palette.accentText} />
        <Text style={styles.actionLabel}>Share link instead</Text>
      </AppPressable>
    </View>
  );

  const fail = (error: unknown) => {
    if (error instanceof AuthApiError && error.code === 'EMAIL_UNAVAILABLE') {
      Alert.alert('Email unavailable', error.message, [
        { text: 'Close', style: 'cancel' },
        { text: 'Share link instead', onPress: onShareInstead },
      ]);
      return;
    }
    Alert.alert('Email not sent', safeDeliveryMessage(error));
  };

  const send = () => {
    if (busy) return;
    setBusy('send');
    void invoiceService.sendInvoice(invoice.id)
      .then(() => {
        Alert.alert('Invoice sent', `Invoice ${invoice.invoiceNumber} was accepted for sending.`);
        onSent();
      })
      .catch(fail)
      .finally(() => setBusy(null));
  };

  const remind = () => {
    if (busy) return;
    setBusy('remind');
    void invoiceService.remindInvoice(invoice.id, invoiceReminderRequest(invoice.invoiceNumber))
      .then(() => {
        Alert.alert('Reminder sent', `The reminder for invoice ${invoice.invoiceNumber} was accepted.`);
      })
      .catch(fail)
      .finally(() => setBusy(null));
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Delivery</Text>
      <Text style={styles.meta}>Send and reminders use the server mailer. If email is unavailable, share a link instead.</Text>
      <AppPressable
        accessibilityRole="button"
        accessibilityLabel="Send invoice"
        accessibilityState={{ busy: busy === 'send', disabled: busy !== null }}
        disabled={busy !== null}
        onPress={send}
        style={styles.action}
      >
        {busy === 'send' ? <ActivityIndicator color={palette.accentText} /> : <Feather name="mail" size={18} color={palette.accentText} />}
        <Text style={styles.actionLabel}>Send invoice</Text>
      </AppPressable>
      <AppPressable
        accessibilityRole="button"
        accessibilityLabel="Send reminder"
        accessibilityState={{ busy: busy === 'remind', disabled: busy !== null }}
        disabled={busy !== null}
        onPress={remind}
        style={styles.action}
      >
        {busy === 'remind' ? <ActivityIndicator color={palette.accentText} /> : <Feather name="bell" size={18} color={palette.accentText} />}
        <Text style={styles.actionLabel}>Send reminder</Text>
      </AppPressable>
    </View>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  card: {
    marginBottom: space.lg,
    padding: space.md,
    borderRadius: radius.group,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.border,
    gap: space.sm,
  },
  title: { ...type.headline },
  meta: { ...type.footnote },
  action: {
    minHeight: control.default,
    borderRadius: radius.pill,
    backgroundColor: palette.fill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.accentText,
  },
});
