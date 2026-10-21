import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import type { BusinessProfile, Invoice } from '@/types/invoice';
import type { InvoiceTemplateId } from '@/types/invoiceTemplates';
import { invoiceService } from '@/services/invoiceService';
import {
  buildInvoiceShareMessage,
  buildPublicInvoiceUrl,
} from '@/features/invoices/invoiceSharing';
import { downloadInvoicePDF, shareInvoicePDF } from '@/utils/pdfUtils';
import { control, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme';

type Action = 'link' | 'download' | 'pdf' | null;

interface InvoiceShareActionsProps {
  visible: boolean;
  invoice: Invoice;
  businessProfile?: BusinessProfile;
  onClose: () => void;
}

export default function InvoiceShareActions({
  visible,
  invoice,
  businessProfile,
  onClose,
}: InvoiceShareActionsProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const palette = theme.colors;
  const template = (invoice.templateName as InvoiceTemplateId | undefined) ?? 'classic';
  const [busy, setBusy] = useState<Action>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) setBusy(null);
  }, [visible]);

  const run = async (action: Exclude<Action, null>, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(action);
    try {
      await work();
    } catch (error) {
      Alert.alert(
        'Unable to complete action',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  const createLink = async (): Promise<string> => {
    if (shareUrl) return shareUrl;
    const share = await invoiceService.createShareLink(invoice.id, template);
    const url = buildPublicInvoiceUrl(share.shareToken);
    setShareUrl(url);
    return url;
  };

  const shareLink = () => run('link', async () => {
    const url = await createLink();
    await Share.share({
      title: `Invoice ${invoice.invoiceNumber}`,
      message: buildInvoiceShareMessage({
        invoiceNumber: invoice.invoiceNumber,
        businessName: businessProfile?.name,
        url,
      }),
      url,
    });
  });

  const copyLink = async () => {
    try {
      const url = await createLink();
      await Clipboard.setStringAsync(url);
      Alert.alert('Link copied', 'The public invoice link is ready to paste.');
    } catch (error) {
      Alert.alert('Unable to copy link', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const openLink = async () => {
    try {
      await Linking.openURL(await createLink());
    } catch (error) {
      Alert.alert('Unable to open link', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const savePdf = () => run('download', async () => {
    const saved = await downloadInvoicePDF(invoice, businessProfile, template);
    if (saved) Alert.alert('PDF ready', 'The invoice PDF was saved or exported successfully.');
  });

  const sharePdf = () => run('pdf', async () => {
    await shareInvoicePDF(invoice, businessProfile, template);
  });

  const rows = [
    { key: 'link' as const, icon: 'link-2' as const, title: 'Share link', subtitle: 'Anyone with the link can view the invoice', onPress: shareLink },
    { key: 'download' as const, icon: 'download' as const, title: 'Download PDF', subtitle: 'Save or export a PDF copy', onPress: savePdf },
    { key: 'pdf' as const, icon: 'share' as const, title: 'Share PDF', subtitle: 'Attach the PDF to another app', onPress: sharePdf },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close share actions" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headingRow}>
          <View>
            <Text style={styles.title}>Share invoice</Text>
            <Text style={styles.subtitle}>{invoice.invoiceNumber}</Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close share actions"
            style={styles.close}
          >
            <Feather name="x" size={20} color={palette.text} />
          </Pressable>
        </View>

        <View style={styles.group}>
          {rows.map((row) => (
            <TouchableOpacity
              key={row.key}
              onPress={row.onPress}
              disabled={busy !== null}
              activeOpacity={0.65}
              accessibilityRole="button"
              accessibilityLabel={row.title}
              accessibilityHint={row.subtitle}
              accessibilityState={{ busy: busy === row.key, disabled: busy !== null }}
              style={styles.row}
            >
              <View style={styles.iconWell}>
                {busy === row.key ? (
                  <ActivityIndicator size="small" color={palette.accentText} />
                ) : (
                  <Feather name={row.icon} size={19} color={palette.accentText} />
                )}
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={palette.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>

        {shareUrl ? (
          <View style={styles.linkCard}>
            <Text numberOfLines={2} selectable style={styles.link}>{shareUrl}</Text>
            <View style={styles.linkActions}>
              <Pressable onPress={copyLink} accessibilityRole="button" accessibilityLabel="Copy link" style={styles.linkButton}>
                <Text style={styles.linkButtonText}>Copy link</Text>
              </Pressable>
              <Pressable onPress={openLink} accessibilityRole="link" accessibilityLabel="Open link" style={styles.linkButton}>
                <Text style={styles.linkButtonText}>Open link</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const createStyles = ({ colors: palette, type }: ReturnType<typeof useTheme>) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: palette.scrim },
  sheet: {
    backgroundColor: palette.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.screen,
    paddingTop: space.sm,
    paddingBottom: 34,
  },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: palette.separator, alignSelf: 'center', marginBottom: space.lg },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  title: { ...type.title },
  subtitle: { ...type.subhead, marginTop: 2 },
  close: { width: control.touchTarget, height: control.touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.fill },
  group: { alignSelf: 'stretch', backgroundColor: palette.surfaceRaised, borderRadius: radius.group, overflow: 'hidden', borderWidth: 1, borderColor: palette.border },
  row: { width: '100%', minHeight: 72, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator },
  iconWell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentFill, marginRight: space.md },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: palette.text },
  rowSubtitle: { fontSize: 13, color: palette.textSecondary, marginTop: 2 },
  linkCard: { marginTop: space.lg, padding: space.md, borderRadius: radius.group, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
  link: { fontSize: 13, lineHeight: 18, color: palette.textSecondary },
  linkActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  linkButton: { minHeight: control.touchTarget, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: palette.fill },
  linkButtonText: { color: palette.accentText, fontWeight: '600' },
});
