import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import type { RootStackParamList } from '@/navigation/types';
import type { MobileSharedInvoiceSnapshot } from '@/features/invoices/api/invoicesApi';
import { invoiceService } from '@/services/invoiceService';
import { generateInvoiceHTML } from '@/utils/invoiceTemplates';
import { downloadInvoicePDF, shareInvoicePDF } from '@/utils/pdfUtils';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModernButton } from '@/components/ui/ModernButton';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme';

type PublicInvoiceRoute = RouteProp<RootStackParamList, 'PublicInvoice'>;

export default function PublicInvoiceScreen() {
  const route = useRoute<PublicInvoiceRoute>();
  const theme = useTheme();
  const styles = createStyles(theme);
  const palette = theme.colors;
  const [snapshot, setSnapshot] = useState<MobileSharedInvoiceSnapshot | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'inactive' | 'missing' | 'offline'>('loading');
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const next = await invoiceService.fetchSharedInvoice(route.params.shareToken);
      if (next === 'inactive') {
        setSnapshot(null);
        setPhase('inactive');
      } else if (!next) {
        setSnapshot(null);
        setPhase('missing');
      } else {
        setSnapshot(next);
        setPhase('ready');
      }
    } catch {
      setSnapshot(null);
      setPhase('offline');
    }
  }, [route.params.shareToken]);

  useEffect(() => {
    load();
  }, [load]);

  const template = (snapshot?.templateName ?? 'classic') as InvoiceTemplateId;
  const html = useMemo(
    () => snapshot
      ? generateInvoiceHTML(snapshot.invoice, snapshot.businessProfile, template)
      : '',
    [snapshot, template],
  );

  const run = async (action: 'download' | 'share') => {
    if (!snapshot || busy) return;
    setBusy(action);
    try {
      if (action === 'download') {
        const saved = await downloadInvoicePDF(snapshot.invoice, snapshot.businessProfile, template);
        if (saved) Alert.alert('PDF ready', 'The invoice PDF was saved or exported successfully.');
      } else {
        await shareInvoicePDF(snapshot.invoice, snapshot.businessProfile, template);
      }
    } catch (actionError) {
      Alert.alert(
        action === 'download' ? 'Unable to save PDF' : 'Unable to share PDF',
        actionError instanceof Error ? actionError.message : 'Please try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={palette.accent} accessibilityLabel="Loading shared invoice" />
        <Text style={styles.loadingText}>Loading shared invoice</Text>
      </SafeAreaView>
    );
  }

  if (phase !== 'ready' || !snapshot) {
    const offline = phase === 'offline';
    return (
      <SafeAreaView style={styles.center}>
        <EmptyState
          icon={<Feather name="file-minus" size={34} color={palette.textSecondary} />}
          title={phase === 'inactive' ? 'Link no longer active' : phase === 'missing' ? 'Invoice not found' : 'Invoice unavailable'}
          description={
            phase === 'inactive'
              ? 'This link is no longer active.'
              : phase === 'missing'
                ? 'This invoice link could not be found.'
                : 'The shared invoice could not be loaded. Check your connection and try again.'
          }
          actionLabel={offline ? 'Try again' : undefined}
          onAction={offline ? load : undefined}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Invoice {snapshot.invoice.invoiceNumber}</Text>
          <Text style={styles.subtitle}>From {snapshot.businessProfile.name}</Text>
        </View>
      </View>
      <WebView
        source={{ html }}
        style={styles.preview}
        originWhitelist={['*']}
        javaScriptEnabled={false}
        domStorageEnabled={false}
        allowFileAccess={false}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        accessibilityLabel={`Shared invoice ${snapshot.invoice.invoiceNumber}`}
      />
      <View style={styles.actions}>
        <ModernButton
          onPress={() => run('download')}
          loading={busy === 'download'}
          disabled={busy !== null}
          variant="secondary"
          fullWidth
          icon={<Feather name="download" size={18} color={palette.text} />}
        >
          Download PDF
        </ModernButton>
        <ModernButton
          onPress={() => run('share')}
          loading={busy === 'share'}
          disabled={busy !== null}
          fullWidth
          icon={<Feather name="share" size={18} color={palette.accentForeground} />}
        >
          Share PDF
        </ModernButton>
      </View>
    </SafeAreaView>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  loadingText: { ...type.subhead, marginTop: space.md },
  header: { paddingHorizontal: space.screen, paddingVertical: space.md, backgroundColor: palette.surfaceRaised, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator },
  headerCopy: { minWidth: 0 },
  title: { ...type.headline },
  subtitle: { ...type.footnote, marginTop: 2 },
  preview: { flex: 1, backgroundColor: palette.surface },
  actions: { gap: space.sm, paddingHorizontal: space.screen, paddingTop: space.md, backgroundColor: palette.surfaceRaised, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator },
});
