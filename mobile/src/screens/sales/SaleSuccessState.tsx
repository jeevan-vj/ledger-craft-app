import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { AppPressable } from '@/components/ui/AppPressable';
import { ReceiptQr } from '@/components/sales/ReceiptQr';
import type { SaleReceiptHandoff } from '@/features/sales/salesApi';
import { buildPublicInvoiceUrl } from '@/features/invoices/invoiceSharing';
import { invoiceService } from '@/services/invoiceService';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

export function SaleSuccessState({ sale, onDone }: { sale: SaleReceiptHandoff; onDone: () => void }) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [url, setUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const leave = () => { active.current = false; onDone(); };

  const openReceipt = async (share: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!onlineManager.isOnline()) throw new Error('offline');
      const receiptUrl = url ?? buildPublicInvoiceUrl((await invoiceService.createShareLink(sale.invoiceId, 'classic')).shareToken);
      if (!active.current) return;
      setUrl(receiptUrl);
      if (share) {
        await Share.share({ title: `Receipt ${sale.invoiceNumber}`, message: `Paid invoice ${sale.invoiceNumber}\n${receiptUrl}` });
      } else {
        setShowQr(true);
      }
    } catch {
      if (active.current) setError('The sale is saved. Check your connection and try the receipt again.');
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.wrap} style={styles.screen}>
      <Text style={styles.kicker}>Sale saved</Text>
      <Text style={styles.number} accessibilityRole="header">{sale.invoiceNumber}</Text>
      <Text style={styles.copy}>The invoice is paid and will show in Invoices.</Text>
      {showQr && url ? <ReceiptQr value={url} /> : null}
      {showQr && url ? <Text style={styles.copy}>Scan to open the paid invoice.</Text> : null}
      {busy ? <ActivityIndicator accessibilityLabel="Creating receipt link" color={theme.colors.accent} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <AppPressable accessibilityRole="button" accessibilityLabel="Show receipt QR" disabled={busy} accessibilityState={{ disabled: busy }} onPress={() => { void openReceipt(false); }} style={styles.secondary}>
        <Text style={styles.copy}>Show receipt QR</Text>
      </AppPressable>
      <AppPressable accessibilityRole="button" accessibilityLabel="Share receipt" disabled={busy} accessibilityState={{ disabled: busy }} onPress={() => { void openReceipt(true); }} style={styles.secondary}>
        <Text style={styles.copy}>Share receipt</Text>
      </AppPressable>
      <AppPressable
        accessibilityRole="button"
        accessibilityLabel="Done"
        onPress={leave}
        style={({ pressed }) => [styles.done, pressed && styles.pressed]}
      >
        <Text style={styles.doneText}>Done</Text>
      </AppPressable>
      <AppPressable accessibilityRole="button" accessibilityLabel="No receipt" onPress={leave} style={styles.secondary}>
        <Text style={styles.copy}>No receipt</Text>
      </AppPressable>
    </ScrollView>
  );
}

const createStyles = ({ colors, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.screen, gap: space.md },
  kicker: { ...type.footnote },
  number: { ...type.display, textAlign: 'center' },
  copy: { ...type.subhead, textAlign: 'center' },
  error: { ...type.footnote, color: colors.danger, textAlign: 'center' },
  secondary: { minHeight: control.touchTarget, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.lg },
  done: {
    minHeight: control.prominent,
    minWidth: 180,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
  doneText: { ...type.headline, color: colors.accentForeground },
  pressed: { opacity: 0.78 },
});
